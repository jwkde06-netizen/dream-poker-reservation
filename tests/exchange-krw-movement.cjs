const assert=require('node:assert/strict');
const fs=require('node:fs');
const {handle,pending,state,agent,domain}=require('./exchange-audit-regressions.cjs');
Object.assign(process.env,{
 EXCHANGE_TELEGRAM_BOT_TOKEN:'100001:synthetic_only_abcdefghijklmnopqrstuvwxyz',
 EXCHANGE_TELEGRAM_CHAT_ID:'-1000001',EXCHANGE_ACTIVATED_AT:'2026-10-21T00:00:00Z',
 EXCHANGE_ADMIN_USER_IDS:'200001',EXCHANGE_TELEGRAM_BOT_USERNAME:'dream_poker_exchange_bot',
 AI_GATEWAY_API_KEY:'synthetic-offline-only'
});
const cases=[];
const test=(name,fn)=>cases.push({name,fn});
test('explicit commands parse exact KRW amounts and account in either position',()=>{
 for(const [text,amount,account,direction] of [
  ['/krwin 계좌 315000','315000','KRW_BANK','in'],
  ['/krwout 100,000원 계좌','100000','KRW_BANK','out'],
  ['/krwin 현금 31.5만원','315000','KRW_CASH','in'],
  ['/krwout 현금 0.001천원','1','KRW_CASH','out'],
  ['/krwin@dream_poker_exchange_bot 계좌 9000000000000 KRW','9000000000000','KRW_BANK','in']
 ]){
  const intent=agent.slashKrwMovement(text);
  assert.equal(intent.amount,amount);assert.equal(intent.account,account);assert.equal(intent.direction,direction);
  assert.equal(intent.category,'capital');assert.equal(intent.basis_vnd,null);
 }
 for(const text of ['예시 /krwin 계좌 315000','/krw 315000','/krwinner 계좌 315000'])assert.equal(agent.slashKrwMovement(text),null);
});
test('no inferred account, fractional won, signs, malformed grouping or extra transaction',()=>{
 for(const text of ['/krwin','/krwout 계좌','/krwin 계좌 0','/krwin 계좌 -5','/krwin 계좌 +5',
  '/krwin 계좌 0.5원','/krwin 계좌 31,50','/krwin 계좌 9000000000001','/krwin 계좌 315000 예정',
  '/krwin 계좌 315000 수수료 5만동','/krwin 계좌 315000\n550만동 나감','/krwin 계좌 315000 현금',
  '/krwin 계좌 1e5','/krwin 계좌 NaN','/krwin 계좌 1/2','/krwin 계좌 315000 VND']){
  assert.throws(()=>agent.slashKrwMovement(text),undefined,text);
 }
 assert.throws(()=>agent.slashKrwMovement('/krwin 315000'),/현금.*계좌/);
 assert.throws(()=>agent.slashKrwMovement('/krwout 계좌 10','KRW_CASH'),/최종 확인/);
});
test('direct additions and withdrawals change only chosen KRW account, never revenue or VND',async()=>{
 for(const text of ['/krwin 계좌 315000','/krwout 계좌 315000','/krwin 현금 315000','/krwout 현금 315000']){
  const r=await handle(text);assert.equal(r.job.status,'applied',r.job.reply_text);assert.equal(r.aiInputs.length,0);
  const plan=r.plans[0].p_plan,intent=agent.slashKrwMovement(text);
  assert.equal(plan.postings.length,1);assert.equal(plan.postings[0].account,intent.account);
  assert.equal(plan.postings[0].amount_minor,intent.direction==='in'?315000:-315000);
  assert.equal(plan.postings[0].after_minor,intent.direction==='in'?1315000:685000);
  assert.equal(plan.fee_vnd,0);assert.equal(plan.fx_profit_vnd,0);assert.equal(plan.expense_vnd,0);
  assert.equal(plan.journal.some(j=>['FEE_REVENUE','FX_REVENUE','OPERATING_EXPENSE'].includes(j.account)),false);
 }
});
test('missing account asks once and same sender answer resolves original command without AI',async()=>{
 for(const command of ['krwin','krwout'])for(const [answer,account] of [['계좌','KRW_BANK'],['현금','KRW_CASH']]){
  const raw='/'+command+' 315000',first=await handle(raw);
  assert.equal(first.job.status,'review');assert.equal(first.plans.length,0);assert.equal(first.aiInputs.length,0);
  const history=[pending({raw_text:raw,reply_text:first.job.reply_text})];
  const r=await handle(answer,{reply:11,history});
  assert.equal(r.job.status,'applied',r.job.reply_text);assert.equal(r.aiInputs.length,0);
  assert.equal(r.job.intent.account,account);assert.equal(r.plans[0].p_resolves_update_id,10);
 }
});
test('unrelated or already resolved account answers never add a movement',async()=>{
 const original=pending({raw_text:'/krwin 315000',reply_text:'원화 시제 증감은 현금인가요, 계좌인가요?'});
 for(const history of [[],[{...original,status:'resolved'}],[{...original,sender_id:'200002'}]]){
  const r=await handle('계좌',{reply:11,history});assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
 }
 assert.throws(()=>agent.pendingKrwMovement(['/krwin 315000','/krwout 315000'],'KRW_BANK'),/서로 다른/);
});
test('commands remain admin-only and respect membership, opening and available balance',async()=>{
 for(const options of [{sender:200002},{memberStatus:'left'},{state:domain.emptyExchangeState()}]){
  const r=await handle('/krwin 계좌 315000',options);assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
 }
 const r=await handle('/krwout 계좌 1000001');assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);assert.match(r.job.reply_text,/잔액이 부족|시제 잔액과 지급 금액/);
 const zero=await handle('/krwout 계좌 1000000');assert.equal(zero.plans[0].p_plan.postings[0].after_minor,0);
});
test('recent duplicate same-text command and competing resolution do not commit',async()=>{
 const prior=pending({raw_text:'/krwin 계좌 315000',status:'applied',reference:'FX-100001-10'});
 const r=await handle(prior.raw_text,{history:[prior]});assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);assert.match(r.job.reply_text,/같은 내용/);
 const conflict=await handle('계좌',{reply:11,history:[pending({raw_text:'/krwin 315000',reply_text:'원화 시제 증감은 현금인가요, 계좌인가요?'})],commitError:'exchange_already_resolved'});
 assert.equal(conflict.job.status,'review');assert.equal(conflict.plans.length,0);assert.match(conflict.job.reply_text,/중복 기록/);
});
test('separate pending commands may share the same account answer',async()=>{
 const oldAnswer=pending({update_id:5,message_id:5,reply_id:6,status:'applied',raw_text:'계좌',
  context_update_id:4,reference:'FX-100001-5',intent:agent.slashKrwMovement('/krwin 계좌 100000')});
 for(const command of ['krwin','krwout']){
  const request=pending({raw_text:'/'+command+' 315000',reply_text:'원화 시제 증감은 현금인가요, 계좌인가요?'});
  const r=await handle('계좌',{reply:11,history:[oldAnswer,request]});
  assert.equal(r.job.status,'applied',r.job.reply_text);assert.equal(r.aiInputs.length,0);
  assert.equal(r.plans.length,1);assert.equal(r.plans[0].p_resolves_update_id,10);
  assert.equal(r.plans[0].p_plan.postings[0].amount_minor,command==='krwin'?315000:-315000);
 }
});
test('unknown KRW acquisition basis stays unknown, while exact balance setter remains distinct',()=>{
 const s=state();s.accounts.KRW_BANK.book_vnd=null;
 const p=domain.planExchange(agent.slashKrwMovement('/krwin 계좌 315000'),s);
 assert.equal(p.postings[0].book_delta_vnd,null);assert.equal(p.postings[0].after_book_vnd,null);assert.equal(p.capital_vnd,null);
 assert.deepEqual(agent.slashExchangeBalance('/krw 315000'),{account:'KRW_BANK',target:315000,label:'원화 계좌'});
 assert.equal(agent.slashExchangeBalance('/krwin 계좌 315000'),null);
});
test('both Telegram menus and help document movement semantics',()=>{
 const source=fs.readFileSync('app/api/exchange/webhook/route.ts','utf8');
 for(const command of ['krwin','krwout'])assert.equal((source.match(new RegExp("command: '"+command+"'",'g'))||[]).length,2);
 assert.match(agent.EXCHANGE_HELP,/원화만 증감/);assert.match(agent.EXCHANGE_HELP,/중복 기록하지 마세요/);
});
(async()=>{
 let failed=0;for(const {name,fn} of cases){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack)}}
 console.log(cases.length+' KRW command cases, '+failed+' failures');process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
