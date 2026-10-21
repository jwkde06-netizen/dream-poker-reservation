const assert = require('node:assert/strict');
const {
  emptyExchangeState, planExchange, reverseExchange, validateExchangeIntent, toMinor,
  convertToVnd, prorata, isAmbiguousBareAmount, reportDates, vietnamDate,
} = require('../.test-build/exchange-domain');
const { verifyExchangeNumberEvidence, formatExchangeReport } = require('../.test-build/exchange-agent');
const { exchangeConfig } = require('../.test-build/exchange-telegram');

const opening = {
  kind: 'opening', balances: { VND_CASH: '20000000', VND_BANK: '1000000', KRW_BANK: '0', USD_CASH: '0' },
  basis_vnd: {}, note: 'Synthetic opening',
};
function apply(state, plan) {
  const next = structuredClone(state); next.initialized = true; next.version++;
  for (const p of plan.postings) next.accounts[p.account] = { balance_minor: p.after_minor, book_vnd: p.after_book_vnd };
  return next;
}
function balanced(plan) { assert.equal(plan.journal.reduce((sum, line) => sum + line.debit_vnd, 0), 0); }
let state = apply(emptyExchangeState(), planExchange(opening, emptyExchangeState()));
const feeTrade = { kind: 'exchange', received: { account: 'VND_BANK', amount: '5500000' }, paid: { account: 'VND_CASH', amount: '5500000' }, fee: { account: 'VND_BANK', amount: '50000' }, received_includes_fee: false, rate_vnd: null, note: 'Cash service', external_reference: null };
const feePlan = planExchange(feeTrade, state);
assert.equal(feePlan.fee_vnd, 50000); assert.equal(feePlan.fx_profit_vnd, 0);
assert.equal(feePlan.postings.find(x => x.account === 'VND_BANK').amount_minor, 5550000);
assert.equal(feePlan.postings.find(x => x.account === 'VND_CASH').amount_minor, -5500000);
balanced(feePlan);
const inclusive = planExchange({ ...feeTrade, received: { account: 'VND_BANK', amount: '5550000' }, received_includes_fee: true }, state);
assert.deepEqual(inclusive.postings, feePlan.postings);
assert.throws(() => planExchange({ ...feeTrade, fee: null, received: { account: 'VND_BANK', amount: '5550000' } }, state), /차이가/);
assert.throws(() => validateExchangeIntent({ ...feeTrade, received_includes_fee: undefined }), /포함/);
assert.throws(() => planExchange(feeTrade, emptyExchangeState()), /시제를 아직/);
assert.throws(() => planExchange(opening, state), /이미 확정/);
assert.throws(() => validateExchangeIntent({ kind: 'opening', balances: { VND_CASH: '1' } }), /통화와 정확한/);

const acquire = planExchange({ ...feeTrade, received: { account: 'USD_CASH', amount: '100' }, paid: { account: 'VND_CASH', amount: '2500000' }, fee: null }, state);
assert.equal(acquire.fx_profit_vnd, 0); assert.equal(acquire.fee_vnd, 0);
assert.equal(acquire.postings.find(x => x.account === 'USD_CASH').book_delta_vnd, 2500000);
assert.equal(acquire.postings.find(x => x.account === 'USD_CASH').amount_minor, 10000); balanced(acquire);
state = apply(state, acquire);
const dispose = planExchange({ ...feeTrade, received: { account: 'VND_BANK', amount: '1100000' }, paid: { account: 'USD_CASH', amount: '40' }, fee: null }, state);
assert.equal(dispose.fx_profit_vnd, 100000);
assert.equal(dispose.postings.find(x => x.account === 'USD_CASH').book_delta_vnd, -1000000); balanced(dispose);
const afterDisposal = apply(state, dispose);
assert.equal(afterDisposal.accounts.USD_CASH.balance_minor, 6000);
assert.equal(afterDisposal.accounts.USD_CASH.book_vnd, 1500000);
const reversal = reverseExchange({ reference: 'FX-100001-4', plan: dispose }, afterDisposal, 'Synthetic correction');
assert.equal(reversal.fx_profit_vnd, -100000); balanced(reversal);
assert.deepEqual(apply(afterDisposal, reversal).accounts, state.accounts);

const unknownState = apply(emptyExchangeState(), planExchange({ ...opening, balances: { ...opening.balances, USD_CASH: '100' } }, emptyExchangeState()));
assert.equal(unknownState.accounts.USD_CASH.book_vnd, null);
const unpriced = planExchange({ ...feeTrade, received: { account: 'VND_BANK', amount: '2500000' }, paid: { account: 'USD_CASH', amount: '100' }, fee: null }, unknownState);
assert.equal(unpriced.fx_profit_vnd, null); assert.equal(unpriced.valuation_incomplete, true);
assert.equal(unpriced.postings.find(x => x.account === 'USD_CASH').after_book_vnd, 0);
assert.equal(unpriced.journal.find(x => x.account === 'FX_REVENUE').debit_vnd, null);

const krw = planExchange({ ...feeTrade, received: { account: 'KRW_BANK', amount: '300000' }, paid: { account: 'VND_CASH', amount: null }, fee: null }, state);
assert.equal(krw.postings.find(x => x.account === 'VND_CASH').amount_minor, -5400000); balanced(krw);
assert.equal(convertToVnd(10000, 'USD_CASH', '25000'), 2500000);
assert.throws(() => convertToVnd(1, 'KRW_BANK', '18.5'), /1동 미만/);
assert.throws(() => planExchange({ ...feeTrade, received: { account: 'KRW_BANK', amount: '100' }, paid: { account: 'VND_CASH', amount: '2000' }, fee: null, rate_vnd: '18' }, state), /일치하지/);
assert.equal(prorata(100, 1, 3), 33); assert.equal(prorata(100, 3, 3), 100); assert.equal(prorata(1, 1, 2), 1);
assert.equal(toMinor('100.01', 'USD_CASH'), 10001);
assert.throws(() => toMinor('100.001', 'USD_CASH'), /소수점/);
assert.throws(() => toMinor('1.1', 'VND_CASH'), /소수점/);
assert.throws(() => toMinor('9000000000001', 'KRW_BANK'), /범위/);
assert.throws(() => planExchange({ ...feeTrade, paid: { account: 'VND_CASH', amount: '99999999999' }, received: { account: 'VND_BANK', amount: '99999999999' }, fee: null }, state), /잔액이 부족/);
assert.equal(isAmbiguousBareAmount('+50000'), true); assert.equal(isAmbiguousBareAmount('50,000'), true);
assert.equal(isAmbiguousBareAmount('VND 현금 수수료 입금 50000'), false);
verifyExchangeNumberEvidence(feeTrade, '베트남 계좌 550만동, 현금 550만동 지급. 5만동 수수료 별도');
assert.throws(() => verifyExchangeNumberEvidence(feeTrade, '베트남 계좌 55만동 받음'), /원문/);

assert.equal(vietnamDate(Date.parse('2026-10-18T18:00:00Z') / 1000), '2026-10-19');
assert.deepEqual(reportDates({ kind: 'report', period: 'last_week', from: null, to: null }, '2026-10-21'), { from: '2026-10-12', to: '2026-10-18' });
assert.throws(() => reportDates({ kind: 'report', period: 'range', from: '2026-02-30', to: '2026-03-01' }, '2026-10-21'), /기간/);
assert.match(formatExchangeReport({ initialized: false }), /아직 확정/);

const envBefore = { ...process.env };
try {
  delete process.env.EXCHANGE_TELEGRAM_CHAT_ID;
  process.env.EXCHANGE_TELEGRAM_BOT_TOKEN = '100001:abcdefghijklmnopqrstuvwxyz123456';
  process.env.EXCHANGE_ACTIVATED_AT = '2026-10-21T00:00:00Z';
  assert.throws(() => exchangeConfig(), /group/);
  process.env.EXCHANGE_TELEGRAM_CHAT_ID = '-1000001';
  process.env.TELEGRAM_BOT_TOKEN = process.env.EXCHANGE_TELEGRAM_BOT_TOKEN;
  assert.throws(() => exchangeConfig(), /own bot token/);
  process.env.TELEGRAM_BOT_TOKEN = '100001:rotated_identity_token_for_test_only';
  assert.throws(() => exchangeConfig(), /own bot token/, 'rotating a token must not turn the same bot into a separate role');
  delete process.env.TELEGRAM_BOT_TOKEN;
  process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET = 'synthetic_shared_webhook_secret';
  process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET = process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET;
  assert.throws(() => exchangeConfig(), /own webhook secret/, 'direct webhook setup must not bypass role-secret separation');
  delete process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET;
  delete process.env.EXCHANGE_ACTIVATED_AT;
  assert.throws(() => exchangeConfig(), /activation/);
} finally { for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key]; Object.assign(process.env, envBefore); }
console.log('exchange: money, ambiguity, cost basis, reversal and configuration checks passed');
