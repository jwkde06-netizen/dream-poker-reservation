const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { planExchange, reverseExchange } = require('../.test-build/exchange-domain');

(async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/exchange_agent.sql'), 'utf8'));
    await db.exec('set role service_role');
    const chat = '-1000001', bot = '100001', owners = new Map();
    const queryOne = async (sql, args = []) => (await db.query(sql, args)).rows[0];
    const state = async () => (await queryOne('select public.dream_exchange_state($1) result', [chat])).result;
    async function claim(id, text = 'synthetic transaction', botId = bot) {
      const owner = randomUUID(); owners.set(`${botId}:${id}`, owner);
      return (await queryOne('select public.dream_exchange_claim($1::text,$2::bigint,$3::text,$4::bigint,$5::text,$6::timestamptz,$7::text,$8::uuid) result', [botId, id, chat, id + 1000, '200001', `2026-10-21T00:${String(id % 60).padStart(2, '0')}:00Z`, text, owner])).result;
    }
    async function commit(id, plan, resolves = null, botId = bot) {
      return (await queryOne('select public.dream_exchange_commit($1::text,$2::bigint,$3::uuid,$4::jsonb,$5::bigint) result', [botId, id, owners.get(`${botId}:${id}`), JSON.stringify(plan), resolves])).result;
    }
    const opening = { kind: 'opening', balances: { VND_CASH: '20000000', VND_BANK: '1000000', KRW_BANK: '0', USD_CASH: '0' }, basis_vnd: {}, note: 'Synthetic opening' };
    assert.equal((await state()).initialized, false);
    await claim(0, 'synthetic incomplete opening');
    await db.query("update public.dream_exchange_jobs set status='review' where bot_id=$1 and update_id=0", [bot]);
    await claim(1, 'synthetic opening preview');
    const openingPlan = planExchange(opening, await state());
    await assert.rejects(() => commit(1, openingPlan), /exchange_opening_confirmation_required/);
    assert.equal((await state()).version, 0);
    await db.query("update public.dream_exchange_jobs set status='review',intent=$1::jsonb,context_update_id=0 where bot_id=$2 and update_id=1", [JSON.stringify(opening), bot]);
    await claim(2, '시제 확정 OPEN-1');
    await db.query('update public.dream_exchange_jobs set context_update_id=1 where bot_id=$1 and update_id=2', [bot]);
    const opened = await commit(2, openingPlan, 1);
    assert.equal(opened.event.kind, 'opening'); assert.equal((await state()).version, 1);
    assert.equal((await queryOne('select status from public.dream_exchange_jobs where bot_id=$1 and update_id=0', [bot])).status, 'resolved');
    assert.equal((await queryOne('select status from public.dream_exchange_jobs where bot_id=$1 and update_id=1', [bot])).status, 'resolved');
    const feeTrade = { kind: 'exchange', received: { account: 'VND_BANK', amount: '5500000' }, paid: { account: 'VND_CASH', amount: '5500000' }, fee: { account: 'VND_BANK', amount: '50000' }, received_includes_fee: false, rate_vnd: null, note: 'Synthetic cash service', external_reference: 'test-bank-ref-1' };
    const before = await state(); const feePlan = planExchange(feeTrade, before);
    await claim(3); const posted = await commit(3, feePlan);
    assert.equal(posted.event.fee_vnd, 50000); assert.equal(posted.event.fx_profit_vnd, 0);
    assert.equal((await state()).accounts.VND_BANK.balance_minor, 6550000);
    assert.equal((await state()).accounts.VND_CASH.balance_minor, 14500000);
    const again = await commit(3, feePlan); assert.equal(again.duplicate, true);
    assert.equal((await state()).version, 2);
    assert.equal((await claim(3)).disposition, 'finished');
    await claim(4);
    await assert.rejects(() => commit(4, feePlan), /exchange_stale/);
    assert.equal((await state()).version, 2);
    const freshDuplicate = planExchange(feeTrade, await state());
    await assert.rejects(() => commit(4, freshDuplicate), /exchange_duplicate_external_reference/);
    assert.equal((await state()).version, 2);
    const zeroSum = await queryOne('select sum(debit_vnd)::text total from public.dream_exchange_journal where event_id=$1', [posted.event.id]);
    assert.equal(zeroSum.total, '0');
    // Balance/fee/journal state and the applied job must all be in the same transaction.
    assert.equal((await queryOne('select status from public.dream_exchange_jobs where bot_id=$1 and update_id=3', [bot])).status, 'applied');
    await db.query("update public.dream_exchange_jobs set status='ignored' where bot_id=$1 and update_id=4", [bot]);
    await claim(5);
    const reversal = reverseExchange(posted.event, await state(), 'Synthetic correction');
    const reversed = await commit(5, reversal);
    assert.equal(reversed.event.fee_vnd, -50000);
    assert.deepEqual((await state()).accounts, before.accounts);
    await claim(6);
    await assert.rejects(async () => commit(6, { ...reversal, version: (await state()).version }), /exchange_already_reversed/);
    await db.query("update public.dream_exchange_jobs set status='ignored' where bot_id=$1 and update_id=6", [bot]);

    const usdTrade = { ...feeTrade, received: { account: 'USD_CASH', amount: '100' }, paid: { account: 'VND_CASH', amount: '2500000' }, fee: null, external_reference: null };
    await claim(7); const usdAcquired = await commit(7, planExchange(usdTrade, await state()));
    const afterAcquisition = await state();
    await claim(8); const disposed = await commit(8, planExchange({ ...usdTrade, received: { account: 'VND_BANK', amount: '1100000' }, paid: { account: 'USD_CASH', amount: '40' } }, await state()));
    assert.equal(disposed.event.fx_profit_vnd, 100000);
    await claim(9);
    await assert.rejects(async () => commit(9, { ...reverseExchange(usdAcquired.event, afterAcquisition, 'Old acquisition'), version: (await state()).version }), /exchange_foreign_reversal_requires_reconciliation/);
    await db.query("update public.dream_exchange_jobs set status='ignored' where bot_id=$1 and update_id=9", [bot]);
    await claim(10); await commit(10, reverseExchange(disposed.event, await state(), 'Undo disposal first'));
    await claim(11); await commit(11, reverseExchange(usdAcquired.event, await state(), 'Then undo acquisition'));
    assert.deepEqual((await state()).accounts, before.accounts);
    const report = (await queryOne("select public.dream_exchange_report($1,'2026-10-21','2026-10-21') result", [chat])).result;
    assert.equal(report.fee_vnd, 0); assert.equal(report.realized_fx_vnd, 0); assert.equal(report.net_known_vnd, 0);
    assert.equal(report.balances.VND_CASH.closing_minor, 20000000);
    assert.equal(report.period_fully_covered, false);
    assert.equal(report.balances.VND_CASH.opening_minor, null, 'unknown pre-opening balances must never become zero');
    const beforeOpeningReport = (await queryOne("select public.dream_exchange_report($1,'2026-10-19','2026-10-20') result", [chat])).result;
    assert.equal(beforeOpeningReport.balances.VND_CASH.closing_minor, null);
    const coveredReport = (await queryOne("select public.dream_exchange_report($1,'2026-10-22','2026-10-22') result", [chat])).result;
    assert.equal(coveredReport.period_fully_covered, true);
    assert.equal(coveredReport.balances.VND_CASH.opening_minor, 20000000);

    // Two partial answers resolve one source chain once, even if another answer arrives later.
    await claim(12, '+50000');
    await db.query("update public.dream_exchange_jobs set status='review' where bot_id=$1 and update_id=12", [bot]);
    await claim(13, 'synthetic currency clarification');
    await db.query("update public.dream_exchange_jobs set status='review',context_update_id=12 where bot_id=$1 and update_id=13", [bot]);
    await claim(14, 'synthetic account and category clarification');
    await db.query('update public.dream_exchange_jobs set context_update_id=13 where bot_id=$1 and update_id=14', [bot]);
    const feeOnly = { kind: 'movement', account: 'VND_BANK', amount: '50000', direction: 'in', category: 'fee', basis_vnd: null, note: 'Synthetic separate fee', external_reference: null };
    await commit(14, planExchange(feeOnly, await state()), 13);
    const resolved = await db.query('select status from public.dream_exchange_jobs where bot_id=$1 and update_id in (12,13)', [bot]);
    assert(resolved.rows.every(x => x.status === 'resolved'));
    const afterClarification = await state();
    await claim(15, 'synthetic competing clarification');
    await db.query('update public.dream_exchange_jobs set context_update_id=12 where bot_id=$1 and update_id=15', [bot]);
    await assert.rejects(async () => commit(15, planExchange(feeOnly, await state()), 12), /exchange_already_resolved/);
    assert.deepEqual(await state(), afterClarification);
    await claim(16, 'synthetic malformed total');
    const corrupt = { ...planExchange(feeOnly, await state()), fee_vnd: 100000 };
    await assert.rejects(() => commit(16, corrupt), /exchange_unbalanced_journal/);
    assert.deepEqual(await state(), afterClarification);

    // Identical update numbers from different bot identities cannot collide.
    assert.equal((await claim(3, 'synthetic second bot', '100002')).disposition, 'claimed');
    await assert.rejects(() => db.query('update public.dream_exchange_jobs set raw_text=$1 where bot_id=$2 and update_id=3', ['changed source', bot]), /immutable/);
    // The service key may read but cannot bypass append-only RPCs with direct DML.
    await assert.rejects(() => db.exec("update public.dream_exchange_accounts set balance_minor=0"), /permission denied/);
    await db.exec('reset role');
    await assert.rejects(() => db.exec("update public.dream_exchange_events set fee_vnd=0"), /append-only/);
    await assert.rejects(() => db.exec('delete from public.dream_exchange_postings'), /append-only/);
    await db.exec('set role anon');
    await assert.rejects(() => state(), /permission denied/);
    await assert.rejects(() => db.exec('select * from public.dream_exchange_events'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(() => state(), /permission denied/);
    console.log('exchange SQL: atomic posting, opening confirmation, idempotency, stale state, references, ordered reversal, immutable audit and role isolation passed');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
