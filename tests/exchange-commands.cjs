const assert=require('node:assert/strict'),fs=require('node:fs');
const {handle,pending,state,agent,domain}=require('./exchange-audit-regressions.cjs');
const commands=require('../.test-build/exchange-commands');
Object.assign(process.env,{EXCHANGE_TELEGRAM_BOT_TOKEN:'100001:synthetic_only_abcdefghijklmnopqrstuvwxyz',EXCHANGE_TELEGRAM_CHAT_ID:'-1000001',EXCHANGE_ACTIVATED_AT:'2026-10-21T00:00:00Z',EXCHANGE_ADMIN_USER_IDS:'200001',EXCHANGE_TELEGRAM_BOT_USERNAME:'dream_poker_exchange_bot'});
const cases=[],test=(name,fn)=>cases.push({name,fn});
const parse=commands.explicitLedgerCommand;
async function applied(text,opts={}){const r=await handle(text,opts);assert.equal(r.job.status,'applied',r.job.reply_text);assert.equal(r.plans.length,1);assert.equal(r.aiInputs.length,0);return r;}
async function blocked(text,opts={}){const r=await handle(text,opts);assert.equal(r.job.status,'review',r.job.reply_text);assert.equal(r.plans.length,0);assert.equal(r.aiInputs.length,0);return r;}
test('all natural text, old clarifications and ambiguous commands never write or call AI',async()=>{
 for(const text of ['315,000원 입금','315,000원 입금\n550만동 나감','200불 받음 500만동 나감','+5만','원화 잔액 315000원','VND 시제 1억','총 유통시제 1억','5만동 취소','네','현금','계좌','수익완료 계좌','시제 확정 OPEN-10','/unknown 315000','/fx 315000 5500000','/fx 315000원','/fx 315000원 550만동 예정'])await blocked(text,{history:[pending()]});
 const source=fs.readFileSync('lib/exchange-agent.ts','utf8');assert.doesNotMatch(source,/ai-gateway|AI_GATEWAY|extractExchange|getVercelOidcToken/);
});
test('FX exact received and paid amounts, both directions and USD cents',async()=>{
 for(const [text,received,paid] of [
  ['/fx 315,000원 550만동',['KRW_BANK',315000],['VND_CASH',-5500000]],
  ['/fx 100 USD 250만동',['USD_CASH',10000],['VND_CASH',-2500000]],
  ['/fx 250만동 100불',['VND_CASH',2500000],['USD_CASH',-10000]],
  ['/fx 550만동 315000 KRW',['VND_CASH',5500000],['KRW_BANK',-315000]],
  ['/fx@dream_poker_exchange_bot 0.01불 1동',['USD_CASH',1],['VND_CASH',-1]]
 ]){const r=await applied(text),p=r.plans[0].p_plan;assert.equal(p.postings.find(x=>x.account===received[0]).amount_minor,received[1]);assert.equal(p.postings.find(x=>x.account===paid[0]).amount_minor,paid[1]);assert.equal(p.fee_vnd,0);}
});
test('separate VND fee is recorded exactly once, never inferred from exchange difference',async()=>{
 const r=await applied('/fx 315000원 550만동 수수료 5만동'),p=r.plans[0].p_plan;
 assert.equal(p.fee_vnd,50000);assert.equal(p.postings.find(x=>x.account==='VND_CASH').amount_minor,-5450000);assert.equal(p.postings.find(x=>x.account==='KRW_BANK').amount_minor,315000);
 for(const text of ['/fx 315000원 550만동 5만동','/fx 315000원 550만동 수수료 5000원','/fx 315000원 550만동 수수료 5만동 수수료 5만동','/fx 315000원 550만동 수수료 포함'])await blocked(text);
});
test('exact amount grammar rejects fractional won, bad commas, missing/extra money and unsafe ranges',()=>{
 for(const text of ['/in 0원','/out -1동','/in +1동','/in 0.1원','/in 0.001USD','/in 31,50원','/in 9000000000001동','/in 1e5원','/in NaN원','/in 10만원 메모','/fx 10원 10원','/fx 10KRW 10원','/in 100','/opening 1억동 0원','/opening 1억동 0원 0원'])assert.throws(()=>parse(text),undefined,text);
 assert.equal(parse('/in 0.001천원').amount,'1');assert.equal(parse('/in 31.5만원').amount,'315000');assert.equal(parse('/in 9000000000000원').amount,'9000000000000');
});
test('KRW aliases and general movements affect bank only and remain capital',async()=>{
 for(const text of ['/krwin 315000','/krwin 현금 31.5만원','/in 315000원','/krwout 315000','/out 31.5만원']){
  const r=await applied(text),p=r.plans[0].p_plan;assert.equal(p.postings.length,1);assert.equal(p.postings[0].account,'KRW_BANK');assert.equal(p.fee_vnd,0);assert.equal(p.fx_profit_vnd,0);assert.equal(p.expense_vnd,0);
 }
 for(const text of ['/in 100불','/out 10만동']){const r=await applied(text);assert.equal(r.job.intent.category,'capital');}
});
test('explicit expenses/profit/loss and legacy fee units retain their distinct meanings',async()=>{
 for(const [text,field,value] of [['/expense 5만동','expense_vnd',50000],['/profit 10만동','fx_profit_vnd',100000],['/loss 10만동','fx_profit_vnd',-100000],['/fee 5','fee_vnd',50000],['/fee 50000','fee_vnd',50000],['/fee5','fee_vnd',50000],['/fee10','fee_vnd',100000],['/fee -31','fx_profit_vnd',-310000]]){
  const r=await applied(text);assert.equal(r.plans[0].p_plan[field],value,text);
 }
 for(const text of ['/expense 100원','/profit 100불','/loss 10원'])await blocked(text);
});
test('same movement/FX aliases dedupe, distinct transactions use a persisted reference',async()=>{
 const earlier=pending({status:'applied',raw_text:'/krwin 계좌 315000',reference:'FX-100001-10',intent:agent.slashKrwMovement('/krwin 계좌 315000')});
 for(const text of ['/krwin 315000','/in 31.5만원','/krwin 현금 315000']){const r=await blocked(text,{history:[earlier]});assert.match(r.job.reply_text,/중복/);}
 await applied('/krwin 300000',{history:[earlier]});await applied('/krwout 315000',{history:[earlier]});
 const fx=pending({status:'applied',raw_text:'/fx 100불 250만동',reference:'FX-100001-10',intent:parse('/fx 100불 250만동')});
 await blocked('/fx 100.00USD 2500000동',{history:[fx]});
 const r=await applied('/krwin 315000 #new-receipt-2',{history:[earlier]});assert.equal(r.plans[0].p_plan.external_reference,'new-receipt-2');
 const duplicate=await blocked('/fx 100불 250만동 #same-ref',{commitError:'exchange_duplicate_external_reference'});assert.match(duplicate.job.reply_text,/외부 거래번호/);
 const old={...earlier,source_date:'2026-11-01T11:54:00Z'};await applied('/krwin 315000',{history:[old]});
});
test('optimistic retry rechecks concurrent command identity and fee aliases',async()=>{
 const prior=pending({status:'applied',raw_text:'/fx 100불 250만동',reference:'FX-100001-10',intent:parse('/fx 100불 250만동')});
 const r=await blocked('/fx 100불 250만동',{stalePrior:prior});assert.equal(r.calls.filter(x=>x==='dream_exchange_commit').length,1);
 const fee=pending({status:'applied',raw_text:'/fee 5',reference:'FX-100001-10',reply_state:'sent',updated_at:'2026-11-01T11:59:01Z',intent:agent.exchangeFeeShortcut('/fee 5')});
 await blocked('/fee 5만동',{history:[fee]});await applied('/fee 5만동 #distinct-fee',{history:[fee]});
 const foreign=await handle(' /fx@another_bot 100불 250만동');assert.equal(foreign.job,undefined);assert.equal(foreign.calls.length,0);
});
test('administration, membership, opening and KRW/USD balance safeguards still apply',async()=>{
 for(const text of ['/krwin 1','/out 1불','/opening 0동 0원 0불','/krw 2000000','/cancel FX-100001-5 오입력'])await blocked(text,{sender:200002});
 await blocked('/fx 100원 1000동',{memberStatus:'left'});await blocked('/in 100불',{state:domain.emptyExchangeState()});
 const current=state();current.accounts.KRW_BANK.balance_minor=100;current.accounts.KRW_BANK.book_vnd=null;current.accounts.KRW_CASH.balance_minor=1000000;
 await blocked('/krwout 101',{state:current});await blocked('/out 101불');
 await applied('/krwout 1000000');
});
test('opening is staged, exact confirm required and existing ledger cannot be reset',async()=>{
 const text='/opening 1억동 30만원 100불',r=await blocked(text,{state:domain.emptyExchangeState()});
 assert.match(r.job.reply_text,/미리보기/);assert.match(r.job.reply_text,/\/confirm OPEN-20/);assert.equal(r.job.intent.balances.KRW_BANK,'300000');assert.equal(r.job.intent.balances.KRW_CASH,'0');assert.equal(r.job.intent.basis_vnd.KRW_BANK,null);
 const preview=pending({raw_text:text,intent:r.job.intent});const done=await applied('/confirm OPEN-10',{state:domain.emptyExchangeState(),history:[preview]});assert.equal(done.plans[0].p_resolves_update_id,10);
 await blocked(text);await blocked('/confirm OPEN-99',{state:domain.emptyExchangeState()});
});
test('historical cash reversal keeps original accounts, with reason, race and repeat guards',async()=>{
 const original={chat_id:'-1000001',reference:'FX-100001-5',plan:domain.planExchange({kind:'movement',account:'KRW_CASH',amount:'100',direction:'in',category:'capital',basis_vnd:null,note:'historical',external_reference:null},state())};
 const r=await applied('/cancel FX-100001-5 금액 오입력',{events:[original]});assert.equal(r.plans[0].p_plan.postings[0].account,'KRW_CASH');assert.equal(r.plans[0].p_plan.postings[0].amount_minor,-100);
 await blocked('/cancel FX-100001-5',{events:[original]});await blocked('/cancel FX-100001-99 오입력',{events:[original]});
 await blocked('/cancel FX-100001-5 오입력',{events:[original],commitError:'exchange_already_reversed'});
});
test('report/help commands do not need AI and never change balances',async()=>{
 const report={initialized:true,from:'2026-10-26',to:'2026-11-01',fee_vnd:0,realized_fx_vnd:0,expense_vnd:0,net_known_vnd:0,balances:{VND_CASH:{closing_minor:100},VND_BANK:{closing_minor:0},KRW_BANK:{closing_minor:300},KRW_CASH:{closing_minor:0},USD_CASH:{closing_minor:100}}};
 for(const text of ['/status','/today','/week','/lastweek','/help','/status@dream_poker_exchange_bot']){const r=await handle(text,{report});assert.equal(r.job.status,'ignored',r.job.reply_text);assert.equal(r.plans.length,0);assert.equal(r.aiInputs.length,0);}
 assert.match(agent.EXCHANGE_HELP,/명령어 전용/);assert.match(agent.EXCHANGE_HELP,/앞 금액은 받은 돈/);
});
(async()=>{let failed=0;for(const {name,fn} of cases){try{await fn();console.log('PASS '+name)}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack)}}console.log(cases.length+' command-only groups, '+failed+' failures');process.exitCode=failed?1:0;})().catch(e=>{console.error(e);process.exitCode=1});
