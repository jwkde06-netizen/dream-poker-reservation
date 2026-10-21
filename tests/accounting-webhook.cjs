const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const telegram=require('../.test-build/accounting-telegram');
const config=require('../.test-build/agent-config');

(async()=>{
 const saved={...process.env};
 try{
  Object.assign(process.env,{TELEGRAM_BOT_TOKEN:'100001:synthetic_legacy_token',TELEGRAM_WEBHOOK_SECRET:'legacy_secret_0123456789',STAFF_TELEGRAM_CHAT_ID:'-1000000001',
   RESERVATION_TELEGRAM_CHAT_ID:'-1000000002',RESERVATION_AGENT_ENABLED:'true',ACCOUNTING_ENABLED:'false',ACCOUNTING_BOT_MODE:'legacy',
   ACCOUNTING_TELEGRAM_BOT_TOKEN:'200002:synthetic_accounting_token',ACCOUNTING_TELEGRAM_WEBHOOK_SECRET:'accounting_secret_0123456789',ACCOUNTING_TELEGRAM_CHAT_ID:'-1000000001',ACCOUNTING_ACTIVATED_AT:'2026-10-21T00:00:00Z'});
  let reservationCalls=0,accountingCalls=0;
  const modules={
   'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
   '../../../../lib/accounting-agent':{handle:async()=>{accountingCalls++}},
   '../../../../lib/accounting-telegram':telegram,
   '../../../../lib/agent-config':config,
   '../../../../lib/reservation-agent':{handleReservationUpdate:async()=>{reservationCalls++;return {ok:true}}}
  };
  const source=fs.readFileSync(require('node:path').join(__dirname,'../app/api/accounting/webhook/route.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const route={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected route dependency '+name);return modules[name]},route);
  const request=(secret,chat)=>new Request('https://example.invalid/api/accounting/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify({update_id:1,message:{chat:{id:chat}}})});
  assert.equal((await route.POST(request('wrong_secret',-1000000002))).status,401);
  assert.equal((await route.POST(request(process.env.TELEGRAM_WEBHOOK_SECRET,-1000000002))).status,200);
  assert.equal(reservationCalls,1,'legacy reservation routing must work while accounting is paused');
  assert.equal(accountingCalls,0);
  assert.equal((await route.POST(request(process.env.TELEGRAM_WEBHOOK_SECRET,-1000000001))).status,503);
  process.env.ACCOUNTING_ENABLED='true';process.env.ACCOUNTING_BOT_MODE='dedicated';
  assert.equal((await route.POST(request(process.env.TELEGRAM_WEBHOOK_SECRET,-1000000002))).status,401);
  assert.equal((await route.POST(request(process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET,-1000000002))).status,200);
  assert.equal(reservationCalls,1,'dedicated accounting secret must never delegate to reservations');
  assert.equal(accountingCalls,1);
  console.log('Accounting webhook: role secret, legacy reservation delegation and independent enablement checks passed');
 }finally{
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
