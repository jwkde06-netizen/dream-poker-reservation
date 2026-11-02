const assert = require('node:assert/strict');
const path = require('node:path');
const build = process.env.EXCHANGE_TEST_BUILD || path.join(__dirname, '../.test-build');
const agent = require(path.join(build, 'exchange-agent'));
const domain = require(path.join(build, 'exchange-domain'));
const telegram = require(path.join(build, 'exchange-telegram'));
const cases = [];
const test = (name, fn) => cases.push({name, fn});
const date = Date.parse('2026-11-01T12:00:00Z') / 1000;
const state = () => ({initialized:true,version:1,opened_at:'2026-10-21T00:00:00Z',
  accounts:Object.fromEntries(domain.ACCOUNT_CODES.map(code=>[code,{
    balance_minor:code.startsWith('VND')?100000000:code.startsWith('KRW')?1000000:10000,
    book_vnd:code.startsWith('VND')?100000000:code.startsWith('KRW')?18000000:2500000
  }]))});
const exchange = (account='KRW_CASH', paid='5400000', rate='18') => ({
  kind:'exchange',received:{account,amount:'300000'},paid:{account:'VND_CASH',amount:paid},
  fee:null,received_includes_fee:false,rate_vnd:rate,note:'Synthetic completed exchange',external_reference:null
});
const pending = (patch={}) => ({
  bot_id:'100001',update_id:10,chat_id:'-1000001',message_id:10,reply_id:11,sender_id:'200001',
  status:'review',raw_text:'원화 30만원 계좌 입금',reply_text:'지급한 동 금액만 알려주세요.',
  source_date:new Date((date-60)*1000).toISOString(),created_at:'2026-11-01T11:59:00Z',
  context_update_id:null,intent:null,plan:null,reference:null,...patch
});

// All persistence, AI and delivery are in-memory mocks. Unknown operations fail.
async function handle(text, options={}) {
  let job, calls=[], plans=[], aiInputs=[], deliveries=[];
  const history=options.history||[];
  const oldDb=agent.exchangeDb, oldTelegram=telegram.exchangeTelegram, oldFetch=global.fetch;
  agent.exchangeDb=()=>({
    async rpc(name,args) {
      calls.push(name);
      if(name==='dream_exchange_claim') {
        job={...pending(),update_id:options.updateId||20,message_id:options.updateId||20,reply_id:null,raw_text:text,source_date:new Date(date*1000).toISOString(),
          sender_id:String(options.sender||200001),status:'processing',owner:args.p_owner,reply_state:'unsent',reply_text:null};
        return {data:{disposition:'claimed',job:{...job}},error:null};
      }
      if(name==='dream_exchange_state') return {data:options.state||state(),error:null};
      if(name==='dream_exchange_claim_reply') return {data:true,error:null};
      if(name==='dream_exchange_memo_command') {
        job={...job,status:'ignored',reply_text:'synthetic memo',reply_state:'unsent'};
        return {data:job,error:null};
      }
      if(name==='dream_exchange_commit') {
        if(options.commitError) return {data:null,error:{message:options.commitError}};
        plans.push(args);
        job={...job,status:'applied',plan:args.p_plan,reference:'FX-100001-20'};
        return {data:{ok:true,event:{reference:job.reference,plan:args.p_plan}},error:null};
      }
      throw Error('Unexpected mock RPC: '+name);
    },
    from(table) {
      assert.ok(['dream_exchange_jobs','dream_exchange_events'].includes(table));
      const filters=[]; let patch, alternatives, limit;
      const rows=()=>{
        let records=table==='dream_exchange_events'?(options.events||[]):[...history,...(job?[job]:[])];
        records=records.filter(r=>filters.every(([key,value,op])=>op==='gte'?r[key]>=value:op==='lte'?r[key]<=value:r[key]===value));
        if(alternatives) records=records.filter(r=>alternatives.some(([key,value])=>String(r[key])===value));
        records.sort((a,b)=>(b.update_id||0)-(a.update_id||0));
        if(limit) records=records.slice(0,limit);
        if(patch) {assert.equal(records.length,1);Object.assign(records[0],patch);}
        return records.map(r=>({...r}));
      };
      const c={
        select(){return c},update(p){patch=p;return c},eq(k,v){filters.push([k,v,'eq']);return c},
        gte(k,v){filters.push([k,v,'gte']);return c},lte(k,v){filters.push([k,v,'lte']);return c},
        or(s){alternatives=s.split(',').map(x=>{const [k,,v]=x.split('.');return [k,v]});return c},
        order(){return c},limit(n){limit=n;return c},
        async single(){return {data:rows()[0]||null,error:null}},
        async maybeSingle(){return {data:rows()[0]||null,error:null}},
        then(resolve,reject){return Promise.resolve({data:rows(),error:null}).then(resolve,reject)}
      };
      return c;
    }
  });
  telegram.exchangeTelegram=async(method,args)=>{
    if(method==='getChatMember') return {status:options.memberStatus||'member'};
    assert.equal(method,'sendMessage');deliveries.push(args.text);return {message_id:1000};
  };
  global.fetch=async(url,args)=>{
    if(url==='https://www.google.com/finance/quote/KRW-VND?hl=en'){
      assert.ok(options.googleHtml!==undefined,'Unexpected Google request');
      return new Response(options.googleHtml);
    }
    assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
    aiInputs.push(JSON.parse(JSON.parse(args.body).messages[1].content));
    if(!options.ai) throw Error('Unexpected AI request');
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(options.ai)}}]}));
  };
  try {
    await agent.handleExchangeUpdate({update_id:options.updateId||20,message:{message_id:options.updateId||20,date,chat:{id:-1000001,type:'group'},
      from:{id:options.sender||200001,is_bot:false},text,...(options.reply?{reply_to_message:{message_id:options.reply}}:{})}});
    return {job,plans,calls,aiInputs,deliveries};
  } finally {agent.exchangeDb=oldDb;telegram.exchangeTelegram=oldTelegram;global.fetch=oldFetch;}
}

test('A4 explicit KRW cash rate mismatch requires review',()=>{
  assert.throws(()=>domain.planExchange(exchange('KRW_CASH','5500000'),state()),/환율과 지급액/);
});
test('A4 matching cash/bank/USD and inferred cash payout remain valid',()=>{
  for(const account of ['KRW_CASH','KRW_BANK']) {
    assert.equal(domain.planExchange(exchange(account),state()).rate_used,'18 VND/KRW');
    assert.match(domain.planExchange(exchange(account,null),state()).rate_used,/18 VND\/KRW/);
  }
  const usd=exchange('USD_CASH','2500000','25000');usd.received.amount='100';
  assert.equal(domain.planExchange(usd,state()).rate_used,'25000 VND/USD');
  assert.doesNotThrow(()=>domain.planExchange(exchange('KRW_CASH','5500000',null),state()));
});
test('A8 억 and 천만 evidence, with unrelated invented amounts rejected',()=>{
  const movement={kind:'movement',account:'VND_CASH',amount:'100000000',direction:'in',category:'capital',basis_vnd:null,note:'test',external_reference:null};
  agent.verifyExchangeNumberEvidence(movement,'시제 보충 1억동');
  agent.verifyExchangeNumberEvidence({...movement,amount:'20000000'},'시제 보충 2천만동');
  assert.throws(()=>agent.verifyExchangeNumberEvidence({...movement,amount:'2000'},'시제 보충 2천만동'));
  assert.throws(()=>agent.verifyExchangeNumberEvidence({...movement,amount:'30000000'},'시제 보충 2천만동'));
});
test('A8 omitted cash zero has provenance; explicit zero and other amounts stay checked',()=>{
  const raw={kind:'opening',balances:{VND_CASH:'100000000',VND_BANK:'20000000',KRW_BANK:'300000',USD_CASH:'100'},basis_vnd:{},note:'opening'};
  const source='기초 시제 동 현금 1억동, 베트남 계좌 2천만동, 원화 계좌 30만원, 달러 현금 100불';
  const intent=domain.validateExchangeIntent(raw);
  agent.verifyExchangeNumberEvidence(intent,source,raw);
  agent.verifyExchangeNumberEvidence(intent,'100000000 20000000 300000 100',raw);
  const explicit={...raw,balances:{...raw.balances,KRW_CASH:'0'}};
  assert.throws(()=>agent.verifyExchangeNumberEvidence(domain.validateExchangeIntent(explicit),source,explicit));
  agent.verifyExchangeNumberEvidence(domain.validateExchangeIntent(explicit),source+' 원화 현금 0원',explicit);
  const invented={...raw,balances:{...raw.balances,KRW_CASH:'500'}};
  assert.throws(()=>agent.verifyExchangeNumberEvidence(domain.validateExchangeIntent(invented),source,invented));
  assert.throws(()=>agent.verifyExchangeNumberEvidence({...intent,balances:{...intent.balances,VND_BANK:'40000000'}},source,raw));
});
test('A8 opening extraction keeps omitted cash provenance through validation',async()=>{
  const raw={kind:'opening',balances:{VND_CASH:'100000000',VND_BANK:'20000000',KRW_BANK:'300000',USD_CASH:'100'},basis_vnd:{},note:'opening'};
  const text='기초 시제 동 현금 1억동, 베트남 계좌 2천만동, 원화 계좌 30만원, 달러 현금 100불';
  const r=await handle(text,{ai:{intent:raw},state:domain.emptyExchangeState()});
  assert.equal(r.job.status,'review');assert.match(r.job.reply_text,/기초 시제 미리보기/);
  assert.equal(r.job.intent.balances.KRW_CASH,'0');assert.equal(r.plans.length,0);
  const explicit={...raw,balances:{...raw.balances,KRW_CASH:'0'}};
  const rejected=await handle(text,{ai:{intent:explicit},state:domain.emptyExchangeState()});
  assert.match(rejected.job.reply_text,/원문에서 금액/);assert.equal(rejected.plans.length,0);
});
test('A3 replenishment and withdrawals cannot become target balance',async()=>{
  for(const text of ['원화 시제 보충 30만원','원화 잔액 30만원 입금','시제 원화 출금 30만원']) {
    const r=await handle(text);
    assert.equal(r.job.status,'review',text);assert.equal(r.plans.length,0);assert.equal(r.aiInputs.length,0);
  }
});
test('A3 exact current account balance stays admin-only; future/prose are not direct targets',async()=>{
  assert.equal(agent.directKrwBalance('원화 계좌 잔액 2,598,000원'),'2598000');
  assert.equal(agent.directKrwBalance('현재 잔액 원화 30만원'),'300000');
  assert.equal(agent.directKrwBalance('원화 잔액 30만원 예정'),null);
  assert.equal(agent.directKrwBalance('예시 원화 잔액 30만원'),null);
  assert.equal(agent.directKrwBalance('원화 현금 잔액 30만원'),null);
  assert.equal(agent.directKrwBalance('/sentbe'),'0');
  const denied=await handle('원화 계좌 잔액 30만원',{sender:200002});
  assert.equal(denied.job.status,'review');assert.equal(denied.plans.length,0);assert.match(denied.job.reply_text,/관리자/);
  const allowed=await handle('원화 계좌 잔액 30만원');
  assert.equal(allowed.plans[0].p_plan.capital_vnd,-12600000);
});
test('A2 conversational 취소 does not invoke fee amount cancellation',async()=>{
  for(const text of ['취소는 어떻게 해요?','오늘 일정 취소됐어요','/cancelled','FX-100001-1 취소하지 마','FX-100001-1 취소 방법 알려줘']) {
    assert.equal(agent.cancellationAmount(text),null);
    const r=await handle(text,{ai:{intent:{kind:'ignore'}}});
    assert.equal(r.job.status,'ignored');assert.equal(r.plans.length,0);
  }
  assert.equal(agent.cancellationAmount('5만동 취소'),50000);
  assert.equal(agent.cancellationAmount('/cancel 50000'),50000);
});
const original=()=>({chat_id:'-1000001',reference:'FX-100001-1',plan:domain.planExchange({
  kind:'movement',account:'VND_CASH',amount:'50000',direction:'in',category:'fee',basis_vnd:null,note:'test',external_reference:null
},state())});
test('A2 documented FX-ID cancellation reaches reversal with reason',async()=>{
  const r=await handle('FX-100001-1 취소, 사유 금액 오입력',{events:[original()]});
  assert.equal(r.plans.length,1);assert.equal(r.plans[0].p_plan.kind,'reversal');
  assert.equal(r.plans[0].p_plan.reverses_reference,'FX-100001-1');
  assert.equal(r.plans[0].p_plan.note,'금액 오입력');assert.equal(r.aiInputs.length,0);
});
test('A2 reason, admin, membership, original and duplicate guards remain',async()=>{
  for(const [text,opts,pattern] of [
    ['FX-100001-1 취소',{},/사유/],
    ['FX-100001-1 취소, 사유',{},/사유/],
    ['FX-100001-1 취소, 사유 오입력',{sender:200002,events:[original()]},/관리자/],
    ['FX-100001-1 취소, 사유 오입력',{memberStatus:'left',events:[original()]},/구성원/],
    ['FX-100001-1 취소, 사유 오입력',{},/찾지 못/],
    ['FX-100001-1 취소, 사유 오입력',{events:[original()],commitError:'exchange_already_reversed'},/이미 취소/],
    ['FX-100001-1 취소, 사유 오입력',{events:[original()],commitError:'exchange_foreign_reversal_requires_reconciliation'},/원가/]
  ]) {
    const r=await handle(text,opts);assert.equal(r.job.status,'review',text);
    assert.equal(r.plans.length,0);assert.match(r.job.reply_text,pattern);
  }
});
test('A2 exact receipt reply and fee amount mismatch preserve prior behavior',async()=>{
  const event=original(),history=[pending({status:'applied',reference:event.reference,plan:event.plan})];
  assert.equal((await handle('취소',{reply:11,history,events:[event]})).plans[0].p_plan.kind,'reversal');
  const mismatch=await handle('6만동 취소',{reply:11,history,events:[event]});
  assert.equal(mismatch.plans.length,0);assert.match(mismatch.job.reply_text,/금액이 다릅니다/);
});
test('A1 bare payout reply follows pending transaction, explicitly and implicitly',async()=>{
  for(const reply of [undefined,11]) {
    const r=await handle('550만동',{reply,history:[pending()],ai:{intent:exchange('KRW_BANK','5500000',null)}});
    assert.equal(r.plans.length,1);assert.equal(r.plans[0].p_plan.kind,'exchange');
    assert.equal(r.plans[0].p_plan.fee_vnd,0);assert.equal(r.plans[0].p_resolves_update_id,10);
    assert.deepEqual(r.aiInputs[0].context.unresolved_texts,['원화 30만원 계좌 입금']);
  }
});
test('A1 model misclassification and ambiguous pending prompts cannot book fee',async()=>{
  const fee=agent.exchangeFeeShortcut('+550만');
  const misclassified=await handle('550만동',{history:[pending()],ai:{intent:fee}});
  assert.equal(misclassified.job.status,'review');assert.equal(misclassified.plans.length,0);
  const ambiguous=await handle('550만동',{history:[pending({reply_text:'어떤 거래인가요?'})]});
  assert.equal(ambiguous.job.status,'review');assert.equal(ambiguous.plans.length,0);assert.equal(ambiguous.aiInputs.length,0);
});
test('A1 new fee policy blocks bare amounts and preserves explicit commands',async()=>{
  for(const [text,history] of [
    ['+5만',[pending()]],['/fee 5만동',[pending()]],
  ]) {
    const r=await handle(text,{history});assert.equal(r.plans[0].p_plan.kind,'movement',text);
    assert.equal(r.plans[0].p_plan.fee_vnd,50000);assert.equal(r.aiInputs.length,0);
  }
  for(const [text,history] of [
    ['5만동',[]],
    ['5만동',[pending({sender_id:'200002'})]],
    ['5만동',[pending({source_date:new Date((date-7200)*1000).toISOString()})]]
  ]) {
    const r=await handle(text,{history});assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
  }
});
test('A1 P1 payout amount cannot also become an invented exchange fee',async()=>{
  for(const reply of [undefined,11]) {
    const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'5500000'}};
    const r=await handle('550만동',{reply,history:[pending()],ai:{intent}});
    assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
  }
});
test('A1 fee evidence is field-specific even when another source number matches',async()=>{
  for(const raw_text of [
    '원화 30만원 계좌 입금, 지급 예정액 550만동',
    '원화 30만원 계좌 입금, 수수료 5만동 별도 받음',
    '원화 30만원 계좌 입금, 수수료 없음',
    '원화 30만원 계좌 입금, 수수료 550만동 예정',
    '원화 30만원 계좌 입금, 수수료 550만동 받음, 수수료 550만동 취소'
  ]) {
    const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'5500000'}};
    const r=await handle('550만동',{history:[pending({raw_text})],ai:{intent}});
    assert.equal(r.job.status,'review',raw_text);assert.equal(r.plans.length,0);
  }
});
test('A1 explicit fee in pending source is preserved, even if equal to payout',async()=>{
  for(const amount of ['50000','5500000']) {
    const raw_text='원화 30만원 계좌 입금, 수수료 '+amount+'동 별도 받음';
    const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount}};
    const r=await handle('550만동',{history:[pending({raw_text})],ai:{intent}});
    assert.equal(r.job.status,'applied');assert.equal(r.plans[0].p_plan.fee_vnd,Number(amount));
  }
});
test('A1 explicit payout and fee in one follow-up retains normal policy',async()=>{
  const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'50000'}};
  const r=await handle('550만동 지급, 수수료 5만동 별도 받음',{reply:11,history:[pending()],ai:{intent}});
  assert.equal(r.job.status,'applied');assert.equal(r.plans[0].p_plan.fee_vnd,50000);
  const wrongFee={...intent,fee:{account:'VND_CASH',amount:'5500000'}};
  const rejected=await handle('550만동 지급, 수수료 5만동 별도 받음',{reply:11,history:[pending()],ai:{intent:wrongFee}});
  assert.equal(rejected.job.status,'review');assert.equal(rejected.plans.length,0);
});
test('A1 pending answer cannot supply received principal or a different payout',async()=>{
  for(const intent of [
    {...exchange('KRW_BANK','5500000',null),received:{account:'KRW_BANK',amount:'5500000'}},
    exchange('KRW_BANK','300000',null),
    exchange('KRW_BANK',null,null)
  ]) {
    const r=await handle('550만동',{history:[pending()],ai:{intent}});
    assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
  }
});
test('A11 수익완료 whitespace variants are ignored without AI or ledger writes',async()=>{
  for(const text of ['수익완료계좌','수익완료 계좌','수익완료   계좌','수익완료\t계좌']) {
    const r=await handle(text);assert.equal(r.job.status,'ignored',text);
    assert.equal(r.aiInputs.length,0);assert.equal(r.plans.length,0);
  }
});
test('A1 latest unlabelled fee correction requires review',async()=>{
  for(const correction of ['아니 안받았음','안 받았음','받지 않았음','정정할게','취소','받은 거 없음']) {
    const raw_text='원화30만원계좌입금, 수수료5만동받음, '+correction;
    const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'50000'}};
    const r=await handle('550만동',{history:[pending({raw_text})],ai:{intent}});
    assert.equal(r.job.status,'review',correction);assert.equal(r.plans.length,0);
  }
});
test('A1 unlabelled correction in a later pending message is retained',async()=>{
  const original=pending({raw_text:'원화30만원계좌입금, 수수료5만동받음'});
  const correction=pending({update_id:12,message_id:12,reply_id:13,raw_text:'아니 안받았음',context_update_id:10});
  const intent={...exchange('KRW_BANK','5500000',null),fee:{account:'VND_CASH',amount:'50000'}};
  const r=await handle('550만동',{reply:13,history:[original,correction],ai:{intent}});
  assert.equal(r.job.status,'review');assert.equal(r.plans.length,0);
});
test('A1 normal fee, equal fee, explicit zero and no fee survive correction guard',async()=>{
  for(const [clause,amount] of [
    ['수수료5만동받음','50000'],['수수료550만동받음','5500000'],
    ['수수료0동','0'],['무수수료',null],['수수료 없음',null]
  ]) {
    const intent={...exchange('KRW_BANK','5500000',null),fee:amount===null?null:{account:'VND_CASH',amount}};
    const r=await handle('550만동',{history:[pending({raw_text:'원화30만원계좌입금, '+clause})],ai:{intent}});
    assert.equal(r.job.status,'applied',clause);assert.equal(r.plans[0].p_plan.fee_vnd,Number(amount||0));
  }
});

module.exports={handle,pending,exchange,state,agent,domain,telegram};
if(require.main===module)(async()=>{
  Object.assign(process.env,{
    EXCHANGE_TELEGRAM_BOT_TOKEN:'100001:synthetic_only_abcdefghijklmnopqrstuvwxyz',
    EXCHANGE_TELEGRAM_CHAT_ID:'-1000001',EXCHANGE_ACTIVATED_AT:'2026-10-21T00:00:00Z',
    EXCHANGE_ADMIN_USER_IDS:'200001',AI_GATEWAY_API_KEY:'synthetic-offline-only'
  });
  let failed=0;
  for(const {name,fn} of cases) {
    try {await fn();console.log('PASS '+name);}
    catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}
  }
  console.log(cases.length+' cases, '+failed+' failures');
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
