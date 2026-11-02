const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
const {handle,pending,exchange,agent,domain}=require('./exchange-audit-regressions.cjs');
const memory=require('../.test-build/accounting-memory');
const cases=[];
const test=(name,fn)=>cases.push({name,fn});
Object.assign(process.env,{EXCHANGE_TELEGRAM_BOT_TOKEN:'100001:synthetic_only_abcdefghijklmnopqrstuvwxyz',
 EXCHANGE_TELEGRAM_CHAT_ID:'-1000001',EXCHANGE_ACTIVATED_AT:'2026-10-21T00:00:00Z',
 EXCHANGE_ADMIN_USER_IDS:'200001',AI_GATEWAY_API_KEY:'synthetic-offline-only'});

test('P1 bare/labelled amounts cannot bypass the final fee guard',async()=>{
 for(const text of ['5만동','수수료 5만동']){
  assert.equal(agent.exchangeFeeShortcut(text),null);
  const r=await handle(text,{ai:{intent:agent.exchangeFeeShortcut('+5만')}});
  assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
 }
});
test('P2 /fee keeps legacy shorthand (<=1000 = 만동); amount-only messages are never fees',async()=>{
 for(const [text,amount] of [['/fee 5',50000],['/fee 100',1000000],['/fee 1000',10000000],['/fee 1001',1001],['/fee 50000',50000]]){
  assert.equal(Number(agent.exchangeFeeShortcut(text).amount),amount,text);
 }
 assert.equal(agent.exchangeFeeShortcut('50000'),null);
 assert.equal(agent.exchangeFeeShortcut('5만동'),null);
 for(const [text,amount] of [['/fee5',50000],['/fee10',100000],['/fee 5만동',50000],['+5만',50000],['/fee@dream_poker_exchange_bot 5만동',50000]]){
  assert.equal(Number(agent.exchangeFeeShortcut(text).amount),amount);
 }
 const legacyLoss=await handle('/fee -5');
 assert.equal(legacyLoss.job.status,'applied');assert.equal(legacyLoss.plans[0].p_plan.fx_profit_vnd,-50000);
 const loss=await handle('/fee -5만동');
 assert.equal(loss.job.status,'applied');assert.equal(loss.plans[0].p_plan.fx_profit_vnd,-50000);
});
test('P1 explicit separate fee in a completed exchange remains accepted',async()=>{
 const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'50000'}};
 const r=await handle('원화 계좌 30만원 받고 550만동 지급 완료, 수수료 5만동 별도 받음',{ai:{intent}});
 assert.equal(r.job.status,'applied');assert.equal(r.plans[0].p_plan.fee_vnd,50000);
});
test('P3 missing KRW mode is reviewed on deterministic, AI and payout paths',async()=>{
 assert.throws(()=>agent.directKrwExchange('5만5천원 원화받고 100만동드림'),/현금.*계좌/);
 for(const [text,intent] of [
  ['원화 30만원 받고 550만동 지급 완료',exchange('KRW_BANK','5500000',null)],
  ['30만원 출금 550만동 받음',null]
 ]){
  const r=await handle(text,{ai:intent?{intent}:undefined});
  assert.equal(r.job.status,'review',text);assert.equal(r.plans.length,0);assert.match(r.job.reply_text,/현금.*계좌/);
 }
 assert.equal(agent.explicitKrwAccount('원화 30만원 받고 동 현금 지급'),null);
 assert.throws(()=>agent.explicitKrwAccount('원화 현금 또는 원화 계좌'),/최종 확인/);
 assert.equal(agent.directKrwExchange('5만5천원 계좌로 받고 100만동드림').received.account,'KRW_BANK');
 const sameBalance=await handle('원화 잔액 100만원');
 assert.equal(sameBalance.job.status,'review');assert.equal(sameBalance.plans.length,0);
 const raw={kind:'opening',balances:{VND_CASH:'100000000',VND_BANK:'20000000',KRW_BANK:'300000',USD_CASH:'100'},basis_vnd:{},note:'opening'};
 const opening=await handle('기초 시제 동 현금 1억, 베트남 계좌 2천만, 원화 30만원, 달러 현금 100불',{ai:{intent:raw},state:domain.emptyExchangeState()});
 assert.equal(opening.job.status,'review');assert.match(opening.job.reply_text,/원화 현금과 원화 계좌/);
});
test('P3 standalone 계좌/현금 binds only to same pending account question',async()=>{
 for(const [text,account] of [['계좌','KRW_BANK'],['현금','KRW_CASH']]){
  const history=[pending({raw_text:'5만5천원 원화받고 100만동드림',reply_text:'원화를 현금으로 받았나요, 계좌로 받았나요?'})];
  const r=await handle(text,{reply:11,history});
  assert.equal(r.job.status,'applied',r.job.reply_text);
  assert.equal(r.job.intent.received.account,account);
  assert.deepEqual(r.job.intent.account_confirmation,{request_update_id:10,answer_update_id:20,account});
  assert.equal(r.plans[0].p_resolves_update_id,10);assert.equal(r.aiInputs.length,0);
 }
});
test('P3 unrelated/resolved/different sender account answers are not reused',async()=>{
 const original=pending({raw_text:'5만5천원 원화받고 100만동드림',reply_text:'원화를 현금으로 받았나요, 계좌로 받았나요?'});
 for(const history of [[],[pending()],[{...original,status:'resolved'}],[{...original,sender_id:'200002'}]]){
  const r=await handle('계좌',{reply:11,history});
  assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);assert.equal(r.aiInputs.length,0);
 }
 const ambiguous=await handle('계좌',{history:[original,{...original,update_id:12,message_id:12,reply_id:13}]});
 assert.equal(ambiguous.job.status,'review');assert.equal(ambiguous.plans.length,0);assert.match(ambiguous.job.reply_text,/여러 건/);
});
test('P3 account choice remains scoped across a later payout clarification',async()=>{
 const original=pending({raw_text:'원화 30만원 받음',reply_text:'원화를 현금으로 받았나요, 계좌로 받았나요?'});
 const selected=await handle('계좌',{reply:11,history:[original],ai:{question:'지급한 동 금액만 알려주세요.'}});
 assert.equal(selected.job.status,'review');assert.equal(selected.job.intent.account_confirmation.account,'KRW_BANK');
 const answered=await handle('550만동',{updateId:40,reply:1000,history:[original,selected.job],ai:{intent:exchange('KRW_BANK','5500000',null)}});
 assert.equal(answered.job.status,'applied',answered.job.reply_text);assert.equal(answered.plans[0].p_resolves_update_id,20);
 const tampered={...selected.job,intent:{...selected.job.intent,account_confirmation:{...selected.job.intent.account_confirmation,answer_update_id:99}}};
 const rejected=await handle('550만동',{updateId:40,reply:1000,history:[original,tampered],ai:{intent:exchange('KRW_BANK','5500000',null)}});
 assert.equal(rejected.job.status,'review');assert.equal(rejected.plans.length,0);
});
test('P5 memo deletion requires registered admin; add/list remain available',async()=>{
 const denied=await handle('/memodel 1',{sender:200002});
 assert.equal(denied.job.status,'review');assert.ok(!denied.calls.includes('dream_exchange_memo_command'));
 for(const [text,sender] of [['/memodel 1',200001],['/memo hello',200002],['/memo',200002]]){
  const r=await handle(text,{sender});assert.ok(r.calls.includes('dream_exchange_memo_command'));
 }
});
test('P6 only administrators save/delete business rules; validation stays strict',()=>{
 for(const action of ['save','delete'])assert.equal(memory.canTeachBusinessRule('member',action),false);
 for(const status of ['administrator','creator'])for(const action of ['save','delete'])assert.equal(memory.canTeachBusinessRule(status,action),true);
 assert.equal(memory.canTeachBusinessRule('member','list'),true);
 assert.throws(()=>memory.validateMemory({action:'save',kind:'instruction',content:'API key 변경'}));
});
test('A9 pair/unit/rate failure stops before commit; valid quote has no deviation limit',async()=>{
 const quote=rate=>'<div data-source="KRW" data-target="VND" data-last-price="'+rate+'">';
 for(const html of ['',quote('0'),quote('-1'),quote('NaN'),quote('101'),
   '<div data-source="USD" data-target="VND" data-last-price="18">',
   '<span>KRW/VND</span><div class="YMlKec fxKbKc">18</div>',
   '<div data-source="KRW" data-target="VND" data-source-amount="100" data-last-price="18">']){
  const r=await handle('/sentbe',{googleHtml:html});
  assert.equal(r.job.status,'review',html);assert.equal(r.plans.length,0);assert.ok(!r.calls.includes('dream_exchange_commit'));
 }
 const r=await handle('/sentbe',{googleHtml:quote('30')});
 assert.equal(r.job.status,'applied');assert.equal(r.plans[0].p_plan.kind,'exchange');
 assert.equal(r.plans[0].p_plan.postings.find(p=>p.account==='VND_CASH').amount_minor,30000000);
});
test('A7 snapshot retains admin guard and never posts historical numeric balances',async()=>{
 const source=fs.readFileSync('app/api/exchange/webhook/route.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 let status='member',sent=[];
 const t={exchangeConfig:()=>({chatId:'-1000001'}),exchangeAuthorized:()=>true,
  exchangeTelegram:async(method,args)=>{if(method==='getChatMember')return {status};sent.push(args.text);return {message_id:1}}};
 const sandbox={exports:{},require:n=>n.includes('exchange-telegram')?t:n.includes('exchange-settings')?{}:n.includes('exchange-agent')?{}:{NextResponse:{}},process:{env:{}}};
 vm.runInNewContext(code+'\nexports.snapshot=handleSnapshotCommand;',sandbox);
 const u={message:{text:'/fxsnapshot',chat:{id:-1000001},from:{id:200001},message_id:1}},row={enabled:true,chat_id:'-1000001'};
 await sandbox.exports.snapshot(u,row);assert.equal(sent.length,0);
 status='administrator';await sandbox.exports.snapshot(u,row);
 assert.equal(sent.length,1);assert.match(sent[0],/과거 수기/);assert.doesNotMatch(sent[0],/\d/);
});
test('Policy keeps Vietnam midnight and existing KRW_CASH rate equality guard',()=>{
 assert.equal(domain.vietnamDate(Date.parse('2026-11-01T16:59:59Z')/1000),'2026-11-01');
 assert.equal(domain.vietnamDate(Date.parse('2026-11-01T17:00:00Z')/1000),'2026-11-02');
 assert.throws(()=>domain.planExchange(exchange('KRW_CASH','1700000','18'),require('./exchange-audit-regressions.cjs').state()),/환율과 지급액/);
});
test('Direct USD receipt / VND payout wording is recognised without AI, in either order',async()=>{
 for(const text of ['200불 받음 500만동 나감','200불 받음, 500만동 나감','200달러 받았어 500만동 줌','+200불 받음/500만동 지급','500만동 나감 200불 받음','500만동 지급, 200불 수령','200 USD 받음 5,000,000 VND 나감','200불-500만동','200불받음-500만동나감']){
  const intent=agent.directUsdExchange(text);
  assert(intent,'recognised: '+text);
  assert.equal(intent.kind,'exchange');assert.equal(intent.received.account,'USD_CASH');assert.equal(intent.received.amount,'200');
  assert.equal(intent.paid.account,'VND_CASH');assert.equal(intent.paid.amount,'5000000');assert.equal(intent.fee,null);
 }
 assert.equal(agent.directUsdExchange('1500.5불 받음 1억동 나감'),null,'억 is not a supported unit here, so it is not guessed');
 assert.equal(agent.directUsdExchange('100.5불 받음 250만동 나감').received.amount,'100.5');
 // Half a transaction, the mirror direction, or extra claims (profit/fees) are never guessed here.
 for(const text of ['200불 받음','500만동 나감','200불 500만동','200불 줌 500만동 받음','200불 받음 500만동 나감 수익 10만','200불 받음 500만동 나감 수수료 5만','원화 200만원 받음 500만동 나감']){
  assert.equal(agent.directUsdExchange(text),null,'not guessed: '+text);
 }
 assert.throws(()=>agent.directUsdExchange('0불 받음 500만동 나감'),/환전 금액/);
 assert.throws(()=>agent.directUsdExchange('200불 받음 0동 나감'),/환전 금액/);
});
test('"200불 받음 500만동 나감" books USD +200 and VND -5,000,000 with zero profit and never calls AI',async()=>{
 const r=await handle('200불 받음 500만동 나감');
 assert.equal(r.aiInputs.length,0,'no AI request');
 assert.equal(r.job.status,'applied',r.job.reply_text);assert.equal(r.plans.length,1);
 const plan=r.plans[0].p_plan,post=a=>plan.postings.find(p=>p.account===a);
 assert.equal(post('USD_CASH').amount_minor,20000);assert.equal(post('VND_CASH').amount_minor,-5000000);
 assert.equal(plan.postings.length,2);
 assert.equal(plan.fx_profit_vnd??0,0);assert.equal(plan.fee_vnd??0,0);assert.equal(plan.expense_vnd??0,0);
 assert.match(r.job.reply_text,/200|5,000,000|500만/);
});
test('Profit stays zero unless the user states it; a stated-profit variant is not swallowed by the direct parser',async()=>{
 const r=await handle('200불 받음 500만동 나감 수익 10만동',{ai:{intent:null}});
 assert.equal(r.aiInputs.length,1,'wording with an extra claim still goes through the normal path');
 assert.equal(r.plans.length,0);
});
test('When the AI is unreachable the staff message says nothing was booked, instead of "check the result"',async()=>{
 const r=await handle('200불 줌 500만동 받음');
 assert.equal(r.job.status,'failed');assert.equal(r.plans.length,0);
 assert.match(r.job.reply_text,/장부에는 반영되지 않았습니다/);
 assert.doesNotMatch(r.job.reply_text,/처리 결과를 확인해야/);
 assert.equal(r.job.failure_reason,'Exchange extraction unavailable; no ledger write was attempted');
});
(async()=>{let failed=0;for(const {name,fn} of cases){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack)}}console.log(cases.length+' policy cases, '+failed+' failures');process.exitCode=failed?1:0})().catch(e=>{console.error(e);process.exitCode=1});
