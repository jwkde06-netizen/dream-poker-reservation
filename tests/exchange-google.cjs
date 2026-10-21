const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const google = require('../.test-build/accounting-google');
const sheets = require('../.test-build/exchange-google');
const settings = require('../.test-build/exchange-settings');
const telegram = require('../.test-build/exchange-telegram');
const setup = require('../.test-build/exchange-onboarding');
(async () => {
  const oldFetch = global.fetch, oldToken = google.accessToken, oldDb = settings.settingsDb, oldLoad = settings.loadExchangeSettings;
  try {
    process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID = 'synthetic_workbook_0000000000';
    google.accessToken = async () => 'synthetic';
    const event = { sequence: 1, reference: 'FX-100001-1', source_date: '2026-10-21T12:00:00Z', business_date: '2026-10-21', kind: 'exchange', sender_id: '200001', update_id: 1, plan: { summary: ['100 USD 수령, 250만동 지급'], postings: [{account:'USD_CASH',amount_minor:10000},{account:'VND_CASH',amount_minor:-2500000}], fee_vnd:0,fx_profit_vnd:null,expense_vnd:0,note:'=IMPORTDATA("https://example.invalid")',valuation_incomplete:true,reverses_reference:null,external_reference:null } };
    const expected = sheets.exchangeSheetRow(event, '=untrusted message');
    assert.equal(expected.row,2); assert.equal(expected.values[11],100); assert.equal(expected.values[8],-2500000); assert.equal(expected.values[6],''); assert.equal(expected.values.length,18);
    let stored=[], puts=0, loseResponse=false;
    global.fetch=async(url,options)=>{
      assert.ok(String(url).startsWith('https://sheets.googleapis.com/v4/spreadsheets/synthetic_workbook_0000000000/'));
      if(options.method==='GET') return new Response(JSON.stringify({valueRanges:[{values:[sheets.EXCHANGE_HEADERS]},{values:stored.length?[stored]:[]}]}));
      assert.ok(String(url).includes('valueInputOption=RAW')); puts++;
      const body=JSON.parse(options.body); assert.equal(body.range,"'환전장부'!A2:R2"); stored=body.values[0];
      if(loseResponse){loseResponse=false;throw Error('synthetic lost response after write');}
      return new Response(JSON.stringify({updatedRows:1,updatedData:{values:[stored]}}));
    };
    loseResponse=true; await assert.rejects(()=>sheets.syncExchangeEvent(event,'=untrusted message'));
    await sheets.syncExchangeEvent(event,'=untrusted message'); assert.equal(puts,1);
    stored[0]='FX-100001-99'; await assert.rejects(()=>sheets.syncExchangeEvent(event,'=untrusted message'),/row changed/); assert.equal(puts,1);
    assert.throws(()=>sheets.exchangeSheetRow({...event,sequence:10000},''));
    let sent=0;
    settings.settingsDb=()=>({from(){const chain={select(){return chain},eq(){return chain},async maybeSingle(){return {data:null,error:{message:'synthetic failure'}}}};return chain;}});
    global.fetch=async()=>{sent++;throw Error('must not acknowledge before Google verification')};
    const config={token:'synthetic',botId:'100001',chatId:'-100001',adminIds:new Set(),activatedAt:0};
    await assert.rejects(()=>telegram.exchangeTelegram('sendMessage',{reply_parameters:{message_id:1},text:'환전 원장 기록 완료 · FX-100001-1\n내용'},config),e=>e instanceof telegram.ExchangeTelegramFailure&&!e.deliveryUnknown);
    assert.equal(sent,0);
    // A warning on the same original message must not re-sync or falsely say completed.
    const warning='수정된 메시지는 원장에 재반영하지 않았습니다.';
    global.fetch=async(url,opts)=>{assert.ok(String(url).includes('/sendMessage'));assert.equal(JSON.parse(opts.body).text,warning);return new Response(JSON.stringify({ok:true,result:{message_id:2}}));};
    await telegram.exchangeTelegram('sendMessage',{reply_parameters:{message_id:1},text:warning},config);
    const key=randomBytes(32).toString('hex');
    process.env.EXCHANGE_SETUP_KEY_HASH=createHash('sha256').update(key).digest('hex'); process.env.EXCHANGE_SETUP_EXPIRES_AT=new Date(Date.now()+60000).toISOString(); process.env.VERCEL_ENV='production';
    assert.equal(setup.validExchangeSetupKey(key),true);assert.equal(setup.validExchangeSetupKey('b'.repeat(64)),false);
    const request=new Request('https://example.invalid/api/exchange/connect',{headers:{'x-exchange-setup-key':key}});
    settings.loadExchangeSettings=async()=>null;assert.equal(await setup.requireExchangeSetup(request),true);
    settings.loadExchangeSettings=async()=>({chat_id:'-100001'});assert.equal(await setup.requireExchangeSetup(request),false);
    process.env.EXCHANGE_SETUP_EXPIRES_AT='2000-01-01T00:00:00Z';assert.equal(setup.validExchangeSetupKey(key),false);
    process.env.EXCHANGE_SETUP_EXPIRES_AT=new Date(Date.now()+60000).toISOString();process.env.VERCEL_ENV='preview';assert.equal(setup.validExchangeSetupKey(key),false);
    console.log('Exchange Sheets tests passed: unit conversion, RAW text, stable retries, lost-write-response recovery, conflict protection, verified success only, edit warning preservation, setup expiry and binding cutoff');
  } finally {global.fetch=oldFetch;google.accessToken=oldToken;settings.settingsDb=oldDb;settings.loadExchangeSettings=oldLoad;}
})().catch(e=>{console.error(e);process.exitCode=1});
