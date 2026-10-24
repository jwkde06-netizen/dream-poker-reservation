const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { emptyExchangeState, planExchange, reverseExchange, formatMoney } = require('../.test-build/exchange-domain');
(async () => {
 const db = new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync('supabase/exchange_agent.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/exchange_vnd_overdraft.sql','utf8'));
  await db.exec("insert into public.dream_exchange_rooms(chat_id,initialized,opened_at) values('overdraft-test',true,'2026-01-01'); insert into public.dream_exchange_accounts(chat_id,account,balance_minor,book_vnd) values('overdraft-test','VND_CASH',8300000,8300000);");
  await db.exec('set role service_role');
  let id=0;
  const state = async () => (await db.query("select public.dream_exchange_state('overdraft-test') as s")).rows[0].s;
  async function post(plan) {
   const owner=randomUUID(); id++;
   await db.query("select public.dream_exchange_claim('999999',$1,'overdraft-test',$1,'999998',now(),'synthetic test',$2)",[id,owner]);
   const args=[id,owner,JSON.stringify(plan)];
   const result=(await db.query("select public.dream_exchange_commit('999999',$1,$2,$3) as r",args)).rows[0].r;
   const again=(await db.query("select public.dream_exchange_commit('999999',$1,$2,$3) as r",args)).rows[0].r;
   assert.equal(again.duplicate,true);
   assert.equal(result.ok,true);
   return result.event;
  }
  const trade={kind:'exchange',received:{account:'USD_CASH',amount:'1000'},paid:{account:'VND_CASH',amount:'25000000'},fee:null,received_includes_fee:false,rate_vnd:null,note:'synthetic',external_reference:null};
  await post(planExchange(trade,await state()));
  assert.equal((await state()).accounts.VND_CASH.balance_minor,-16700000);
  assert.equal(formatMoney(-16700000,'VND_CASH'),'-16,700,000 VND');
  await post(planExchange(trade,await state()));
  assert.equal((await state()).accounts.VND_CASH.balance_minor,-41700000);
  const movement={kind:'movement',account:'VND_CASH',amount:'10000000',direction:'in',category:'capital',basis_vnd:null,note:'synthetic replenishment',external_reference:null};
  const deposit=await post(planExchange(movement,await state()));
  assert.equal((await state()).accounts.VND_CASH.balance_minor,-31700000);
  await post(reverseExchange(deposit,await state(),'synthetic reversal'));
  assert.equal((await state()).accounts.VND_CASH.balance_minor,-41700000);
  await post(planExchange({...movement,amount:'41700000'},await state()));
  assert.deepEqual((await state()).accounts.VND_CASH,{balance_minor:0,book_vnd:0});
  await post(planExchange({...movement,amount:'50000',category:'fee'},await state()));
  assert.equal((await state()).accounts.VND_CASH.balance_minor,50000);
  await post(planExchange({...movement,account:'VND_BANK',amount:'1000000',direction:'out',category:'expense'},await state()));
  assert.equal((await state()).accounts.VND_BANK.balance_minor,-1000000);
  const current=await state();
  assert.throws(()=>planExchange({...trade,received:{account:'VND_CASH',amount:'250000000'},paid:{account:'USD_CASH',amount:'10000'}},current));
  const unknown=structuredClone(current);unknown.accounts.USD_CASH.book_vnd=null;
  assert.throws(()=>planExchange({...trade,received:{account:'VND_CASH',amount:'250000000'},paid:{account:'USD_CASH',amount:'10000'}},unknown),/부족/);
  const huge=structuredClone(current);huge.accounts.VND_CASH={balance_minor:-9000000000000,book_vnd:-9000000000000};
  assert.throws(()=>planExchange(trade,huge),/범위/);
  await db.exec('reset role');
  await assert.rejects(()=>db.exec("update public.dream_exchange_accounts set balance_minor=-1,book_vnd=-1 where account='USD_CASH'"),/check constraint/);
  const sums=(await db.query('select event_id,sum(debit_vnd)::text as total from public.dream_exchange_journal group by event_id')).rows;
  assert.ok(sums.every(x=>x.total==='0'));
  console.log('VND negative balances: payout, repeat payout, deposit, reversal, zero, fee, bank, limits, foreign guards, journal and idempotency passed');
 } finally {await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
