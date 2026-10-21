const assert=require('node:assert/strict');
const {accountingIdentity,accountingWebhookAuthorized,accountingEventKey,accountingMessageAllowed}=require('../.test-build/accounting-telegram');
const {accountingStore}=require('../.test-build/accounting-store');
const {
  buildWeeklyAccountingDraft,validateCashierEvidence,weeklyDraftCsv,sheetRoundThousands,parseWeeklyRequest
}=require('../.test-build/accounting-report');
const {serial}=require('../.test-build/accounting-plan');

const legacy={TELEGRAM_BOT_TOKEN:'100001:legacy_token',TELEGRAM_WEBHOOK_SECRET:'legacy_webhook_secret_012345',STAFF_TELEGRAM_CHAT_ID:'-1000000001'};
const staged={...legacy,ACCOUNTING_TELEGRAM_BOT_TOKEN:'200002:dedicated_token',ACCOUNTING_TELEGRAM_WEBHOOK_SECRET:'dedicated_webhook_secret_012345',ACCOUNTING_TELEGRAM_CHAT_ID:'-1000000001'};
const dedicated={...staged,ACCOUNTING_BOT_MODE:'dedicated',ACCOUNTING_ACTIVATED_AT:'2026-10-21T11:00:00Z'};
assert.equal(accountingIdentity(staged).mode,'legacy','staging credentials must not switch the live bot');
assert.equal(accountingIdentity(legacy).jobsTable,'dream_accounting_jobs');
assert.equal(accountingIdentity(dedicated).jobsTable,'dream_accounting_jobs_v2');
assert.notEqual(accountingEventKey(accountingIdentity(legacy),42),accountingEventKey(accountingIdentity(dedicated),42));
assert.throws(()=>accountingIdentity({...dedicated,ACCOUNTING_TELEGRAM_WEBHOOK_SECRET:undefined}));
assert.throws(()=>accountingIdentity({...dedicated,ACCOUNTING_TELEGRAM_CHAT_ID:undefined}));
assert.throws(()=>accountingIdentity({...dedicated,ACCOUNTING_ACTIVATED_AT:undefined}));
assert.throws(()=>accountingIdentity({...dedicated,ACCOUNTING_TELEGRAM_BOT_TOKEN:legacy.TELEGRAM_BOT_TOKEN}));
assert.throws(()=>accountingIdentity({...dedicated,ACCOUNTING_TELEGRAM_BOT_TOKEN:'100001:regenerated_token'}),'regenerating a token does not create a separate bot identity');
const request=secret=>new Request('https://example.invalid/api/accounting/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret}});
assert.equal(accountingWebhookAuthorized(request(legacy.TELEGRAM_WEBHOOK_SECRET),dedicated),false,'a reservation/legacy secret cannot authorize the accounting identity');
assert.equal(accountingWebhookAuthorized(request(dedicated.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET),dedicated),true);
for(const key of ['TELEGRAM_WEBHOOK_SECRET','RESERVATION_TELEGRAM_WEBHOOK_SECRET','EXCHANGE_TELEGRAM_WEBHOOK_SECRET']){
  const shared={...dedicated,[key]:dedicated.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET};
  assert.throws(()=>accountingIdentity(shared),/own webhook secret/);
  assert.equal(accountingWebhookAuthorized(request(shared.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET),shared),false,'shared '+key+' must fail closed even with a matching request header');
}
const liveMessage={chat:{id:-1000000001,type:'group'},from:{id:123},date:Date.parse(dedicated.ACCOUNTING_ACTIVATED_AT)/1000};
assert.equal(accountingMessageAllowed(accountingIdentity(dedicated),liveMessage),true);
assert.equal(accountingMessageAllowed(accountingIdentity(dedicated),{...liveMessage,date:liveMessage.date-1}),false,'queued pre-cutover messages must not replay');
assert.equal(accountingMessageAllowed(accountingIdentity(dedicated),{...liveMessage,chat:{id:-1000000002,type:'group'}}),false,'accounting must not read the reservation room');

const headers=['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN','RAKE','RAKE BACK','MONGOL','JAPAN','CHINA (AK)','HOUSE','KOREA2'];
const row=[1,serial('2026-10-12'),'13-1','5M','KIM TEST','123','KOREA',2,1000000,500000,0,0,0,0,0];
const fnb=[['DATE','FLOOR','AMOUNT','NOTE'],[serial('2026-10-12'),'3F',60000,'coffee']];
const totals={buyins:2,rake:1000000,rakeBack:500000,fnb:60000,mongol:0,japan:0,china:0,house:0,korea2:0};
const source={date:'2026-10-12',source:'viber',reference:'cashier original 1',totals};
const base={startDate:'2026-10-12',endDate:'2026-10-12',daily:[headers,row],fnb,evidence:[source],salaryAdvanceVnd:0,partnerFormulaVerified:true};
let report=buildWeeklyAccountingDraft(base);
assert.equal(report.status,'ready_for_review');
assert.equal(report.netProfit,440000);
assert.equal(report.partnerShares.reduce((sum,part)=>sum+part.amountVnd,0),440000);
assert.equal(report.sendAllowed,false);
assert.equal(report.recipient,'김지영 대표');
assert.equal(buildWeeklyAccountingDraft({...base,evidence:[]}).status,'needs_review');
assert.equal(buildWeeklyAccountingDraft({...base,evidence:[]}).comparison.find(row=>row.metric==='fnb').cashier,null,'missing cashier values must not become zero');
assert.equal(buildWeeklyAccountingDraft({...base,salaryAdvanceVnd:null}).netProfit,null);
assert.equal(buildWeeklyAccountingDraft({...base,partnerFormulaVerified:false}).partnerShares,null);
const closedDay={...base,daily:[headers],fnb:[fnb[0]],evidence:[]};
assert.equal(buildWeeklyAccountingDraft(closedDay).status,'needs_review','an empty ledger day is not proof the room was closed');
assert.equal(buildWeeklyAccountingDraft({...closedDay,evidence:[{...source,totals:Object.fromEntries(Object.keys(totals).map(key=>[key,0]))}]}).status,'ready_for_review','explicit cashier zero totals can confirm a no-activity day');
assert.equal(sheetRoundThousands(-500),-1000,'negative half rounding must follow the sheet');
report=buildWeeklyAccountingDraft({...base,evidence:[source,{...source,reference:'forwarded copy'}]});
assert.equal(report.status,'ready_for_review','identical cashier reports are compared, never added together');
assert.equal(report.comparison.find(row=>row.metric==='rakeBack').cashier,500000);
report=buildWeeklyAccountingDraft({...base,evidence:[source,{...source,reference:'conflicting copy',totals:{...totals,rakeBack:490000}}]});
assert.equal(report.comparison.find(row=>row.metric==='rakeBack').status,'conflict');
assert.equal(report.comparison.find(row=>row.metric==='rakeBack').cashier,null,'never silently choose a conflicting source');
report=buildWeeklyAccountingDraft({...base,evidence:[{...source,totals:{...totals,fnb:50000}}]});
assert.equal(report.comparison.find(row=>row.metric==='fnb').difference,10000);
assert.equal(report.status,'needs_review');
const broken=[...row];broken[9]='#REF!';
report=buildWeeklyAccountingDraft({...base,daily:[headers,broken]});
assert.equal(report.ledgerValuesComplete,false);
assert.equal(report.netProfit,null,'a broken source formula must not produce a final-looking payable amount');
report=buildWeeklyAccountingDraft({...base,daily:[headers,row,row]});
assert(report.issues.some(issue=>issue.code==='duplicate_game'));
assert.equal(report.netProfit,null);
assert.throws(()=>validateCashierEvidence({...source,totals:{rakeBack:-1}}));
assert.throws(()=>validateCashierEvidence({...source,date:'2026-02-30'}));
assert.throws(()=>buildWeeklyAccountingDraft({...base,endDate:'2026-12-01'}));
report=buildWeeklyAccountingDraft({...base,evidence:[{...source,reference:'=HYPERLINK("https://example.invalid")'}]});
assert(weeklyDraftCsv(report).includes("'=HYPERLINK"),'CSV evidence must not become an executable formula');
assert.deepEqual(parseWeeklyRequest('지난주 정산','2026-10-21'),{startDate:'2026-10-12',endDate:'2026-10-18'});
assert.deepEqual(parseWeeklyRequest('주간 정산 2026-10-12 ~ 2026-10-18','2026-10-21'),{startDate:'2026-10-12',endDate:'2026-10-18'});
assert.throws(()=>parseWeeklyRequest('주간 정산','2026-10-21'));

// Exercise the actual store with colliding Telegram update IDs. A tiny in-memory
// query adapter keeps the test independent from credentials and a live database.
function memoryClient(tables={}) {
  return {tables,from(table){
    tables[table]??=[];
    let filters=[],mutation=null,conflict=null,limit=null;
    const matches=row=>filters.every(([key,value,operator])=>operator==='neq'?row[key]!==value:row[key]===value);
    const run=()=>{
      if(mutation?.type==='upsert'){
        const existing=tables[table].find(row=>conflict.every(key=>row[key]===mutation.row[key]));
        if(!existing)tables[table].push({...mutation.row});
      }
      if(mutation?.type==='update')for(const row of tables[table])if(matches(row))Object.assign(row,mutation.row);
      return tables[table].filter(matches).slice(0,limit??undefined).map(row=>({...row}));
    };
    const q={
      select(){return q},eq(key,value){filters.push([key,value]);return q},
      neq(key,value){filters.push([key,value,'neq']);return q},
      upsert(row,options){mutation={type:'upsert',row};conflict=options.onConflict.split(',');return q},
      update(row){mutation={type:'update',row};return q},limit(value){limit=value;return q},
      single(){const values=run();return Promise.resolve({data:values.length===1?values[0]:null,error:values.length===1?null:{message:'not single'}})},
      then(resolve,reject){try{return Promise.resolve({data:run(),error:null}).then(resolve,reject)}catch(error){return Promise.reject(error).then(resolve,reject)}}
    };return q;
  }};
}
(async()=>{
  const client=memoryClient({dream_accounting_jobs:[{update_id:42,message_id:77,status:'applied',image_key:'old-photo'}]});
  const identity=accountingIdentity(dedicated);
  const first=accountingStore(client,identity);
  const second=accountingStore(client,{...identity,botId:'300003'});
  const message={message_id:88,from:{id:1},text:'request'};
  await first.receive({update_id:42},message);
  await second.receive({update_id:42},{...message,message_id:89});
  assert.equal(client.tables.dream_accounting_jobs_v2.length,2);
  await first.save(42,{status:'applied'});
  assert.equal((await second.get(42)).status,'received','one bot must not change the other bot same update ID');
  assert.deepEqual(await second.priorMessage(88),{status:'applied'});
  await first.save(42,{status:'uncertain'});
  assert.deepEqual(await second.priorMessage(88),{status:'uncertain'},'an uncertain previous bot outcome must require review rather than replay');
  const staffChat=process.env.STAFF_TELEGRAM_CHAT_ID;
  try{
    process.env.STAFF_TELEGRAM_CHAT_ID=identity.chatId;
    assert.deepEqual(await first.priorMessage(77),{status:'applied'});
    client.tables.dream_accounting_jobs[0].status='writing';
    assert.deepEqual(await first.priorMessage(77),{status:'writing'},'a legacy write must remain visible across the bot cutover');
    client.tables.dream_accounting_jobs[0].status='applied';
  }finally{if(staffChat===undefined)delete process.env.STAFF_TELEGRAM_CHAT_ID;else process.env.STAFF_TELEGRAM_CHAT_ID=staffChat;}
  assert.equal(await first.duplicate(99,'old-photo'),true,'dedicated bot must honor legacy processed photos');
  assert.equal(await first.duplicate(999,'new-photo'),false);
  assert.equal(client.tables.dream_accounting_jobs[0].status,'applied','new namespace must not mutate old jobs');
  console.log('Accounting identity, cutover idempotency and weekly reconciliation checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
