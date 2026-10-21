const assert = require('node:assert/strict');
const receipt = require('../.test-build/exchange-receipt');
const sheets = require('../.test-build/exchange-google');
const settings = require('../.test-build/exchange-settings');
const google = require('../.test-build/accounting-google');
const telegram = require('../.test-build/exchange-telegram');
const ts = s => Date.parse(s) / 1000;
const base = {
  initialized: true, from: '2026-10-19', to: '2026-10-25', period_fully_covered: true,
  fee_vnd: 100000, realized_fx_vnd: 250000, expense_vnd: 50000, net_known_vnd: 300000,
  unvalued_fx_count: 0, unresolved_count: 0, unvalued_holdings: 0,
  balances: { VND_CASH:{closing_minor:10000000}, VND_BANK:{closing_minor:3000000}, KRW_BANK:{closing_minor:1234567}, USD_CASH:{closing_minor:12345} },
};
const plan = { kind: 'exchange', fee_vnd:50000,fx_profit_vnd:0,expense_vnd:0,postings:[],summary:['Synthetic test only'],note:'',valuation_incomplete:false };
const report = patch => ({ ...base, ...patch });
(async () => {
  assert.deepEqual(receipt.exchangeSettlementPeriod(ts('2026-10-25T16:59:59Z')), {from:'2026-10-19',to:'2026-10-25',settlesOn:'2026-10-25'});
  assert.deepEqual(receipt.exchangeSettlementPeriod(ts('2026-10-25T17:00:00Z')), {from:'2026-10-26',to:'2026-10-26',settlesOn:'2026-11-01'});
  assert.deepEqual(receipt.exchangeSettlementPeriod(ts('2027-01-01T00:00:00Z')), {from:'2026-12-28',to:'2027-01-01',settlesOn:'2027-01-03'});
  const before = JSON.stringify(base), text = receipt.formatExchangeBalanceReceipt('FX-100001-1', plan, base);
  for (const expected of ['📊 DREAM EXCHANGE','13,000,000','123.45','1,234,567','이번 거래 50,000동','이체수수료 100,000동','누적 수익 300,000동']) assert.ok(text.includes(expected),expected);
  assert.ok(!text.includes('VND_CASH') && !text.includes('미해결 입력'));
  assert.equal(JSON.stringify(base),before); assert.ok(text.length<4096);
  const partial=receipt.formatExchangeBalanceReceipt('FX-100001-1',{...plan,fx_profit_vnd:null},report({period_fully_covered:false,unvalued_fx_count:2,unresolved_count:1,unvalued_holdings:1}));
  assert.ok(partial.includes('누적 수익'));
  const loss=receipt.formatExchangeBalanceReceipt('FX-100001-1',plan,report({fee_vnd:0,realized_fx_vnd:0,expense_vnd:50000,net_known_vnd:-50000})); assert.ok(loss.includes('-50,000동'));
  assert.ok(!receipt.formatExchangeBalanceReceipt('FX-100001-1',{...plan,kind:'opening'},base).includes('✅ 기록 완료'));
  for(const bad of [report({initialized:false}),report({from:'2026-10-18'}),report({net_known_vnd:300001}),report({balances:{...base.balances,USD_CASH:{closing_minor:null}}})]) assert.throws(()=>receipt.formatExchangeBalanceReceipt('FX-100001-1',plan,bad));
  const oldFetch=global.fetch,oldDb=settings.settingsDb,oldToken=google.accessToken;
  const oldWorkbook=process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID;
  try {
    process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID='synthetic_workbook_0000000000'; google.accessToken=async()=>'synthetic';
    const event={sequence:1,reference:'FX-100001-1',source_date:'2026-10-21T12:00:00Z',business_date:'2026-10-21',kind:'exchange',sender_id:'200001',update_id:1,plan};
    const values=sheets.exchangeSheetRow(event,'synthetic').values;
    let verified=false,failReport=false,reportCalls=0,sends=0;
    settings.settingsDb=()=>({
      from(table){const c={select(){return c},eq(){return c},async maybeSingle(){return {data:event,error:null}},async single(){assert.equal(table,'dream_exchange_jobs');return {data:{raw_text:'synthetic'},error:null}}};return c},
      async rpc(name,args){assert.equal(name,'dream_exchange_report');assert.equal(verified,true);assert.equal(args.p_chat_id,'-100001');reportCalls++;return failReport?{data:null,error:{message:'synthetic'}}:{data:{...base,from:args.p_from,to:args.p_to},error:null}}
    });
    global.fetch=async(url,opts)=>{
      if(String(url).startsWith('https://sheets.googleapis.com/')){assert.equal(opts.method,'GET');verified=true;return new Response(JSON.stringify({valueRanges:[{values:[sheets.EXCHANGE_HEADERS]},{values:[values]}]}));}
      assert.ok(String(url).includes('/sendMessage'));sends++;assert.ok(JSON.parse(opts.body).text.includes('🇺🇸 USD 123.45'));return new Response(JSON.stringify({ok:true,result:{message_id:2}}));
    };
    const config={token:'synthetic',botId:'100001',chatId:'-100001',adminIds:new Set(),activatedAt:0};
    const payload={reply_parameters:{message_id:1},text:'환전 원장 기록 완료 · FX-100001-1\n내용'};
    await telegram.exchangeTelegram('sendMessage',payload,config);assert.equal(sends,1);assert.equal(reportCalls,1);
    failReport=true;await assert.rejects(()=>telegram.exchangeTelegram('sendMessage',payload,config),e=>e instanceof telegram.ExchangeTelegramFailure&&!e.deliveryUnknown);assert.equal(sends,1);
    failReport=false;await telegram.exchangeTelegram('sendMessage',payload,config);assert.equal(sends,2);assert.equal(reportCalls,3);
  } finally {global.fetch=oldFetch;settings.settingsDb=oldDb;google.accessToken=oldToken;if(oldWorkbook===undefined)delete process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID;else process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID=oldWorkbook;}
  console.log('Exchange receipt: all currencies, cash/bank total, profit/loss, missing-cost warnings, Vietnam Sunday boundary, no mutation, verified sheet before summary and safe retries passed');
})().catch(e=>{console.error(e);process.exitCode=1});
