const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/insurance-notification-relay.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:mod,exports:mod.exports,require,Buffer,Response,Request,AbortSignal});
const {createInsuranceRelay}=mod.exports;
const secret='a'.repeat(64),store_id='108bedf9-cba7-4783-8573-57e6242a02e6';
const config={secret,botToken:'private-test-token',staffChatId:'-5322020390'};
const request=(input={},auth=secret)=>new Request('https://relay.test',{
  method:'POST',headers:{Authorization:'Bearer '+auth},body:JSON.stringify({store_id,...input})});
const event={operation:'send',event_id:'11111111-1111-4111-8111-111111111111',text:'[보험 알림 연결 테스트]\n실제 장부 변경 없음'};

test('relay: missing/wrong/unicode secret does not access Telegram',async()=>{
  const handler=createInsuranceRelay(config,()=>assert.fail('must not fetch'));
  for(const auth of ['', 'b'.repeat(64),'é'.repeat(64)]) assert.equal((await handler(request({},auth))).status,401);
  assert.equal((await handler(request({...event,store_id:'other-store'}))).status,403);
});
test('relay: reject arbitrary operations or text',async()=>{
  const handler=createInsuranceRelay(config,()=>assert.fail('must not fetch'));
  for(const input of [{operation:'deleteMessage'},{...event,text:'arbitrary message'},{...event,event_id:'bad-id'}])
    assert.equal((await handler(request(input))).status,400);
});
test('relay: sends to configured staff room only and returns no bot credential',async()=>{
  let calls=0;
  const handler=createInsuranceRelay(config,async(url,options)=>{
    calls++;assert.match(url,/sendMessage$/);
    const body=JSON.parse(options.body);assert.equal(body.chat_id,config.staffChatId);assert.equal(body.text,event.text);
    assert.equal(body.parse_mode,undefined);
    return Response.json({ok:true,result:{message_id:45}});
  });
  const result=await handler(request({...event,chat_id:'-999'}));
  assert.equal(result.status,200);assert.equal(calls,1);
  assert.equal((await result.json()).result.message_id,45);
});
test('relay: probe verifies group title and bot permissions without sending',async()=>{
  const handler=createInsuranceRelay(config,async(url)=>{
    if(url.endsWith('getMe'))return Response.json({ok:true,result:{id:1,username:'test_bot'}});
    if(url.endsWith('getChat'))return Response.json({ok:true,result:{id:-5322020390,title:'Dream Staff',type:'group'}});
    assert.match(url,/getChatMember$/);return Response.json({ok:true,result:{status:'administrator'}});
  });
  const result=await(await handler(request({operation:'probe'}))).json();
  assert.equal(result.title,'Dream Staff');assert.equal(result.can_send,true);
});
test('relay: 429 remains retriable; unknown network delivery is not labeled failed',async()=>{
  const limited=createInsuranceRelay(config,async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:9}},{status:429}));
  const r=await limited(request(event));assert.equal(r.status,429);assert.equal((await r.json()).parameters.retry_after,9);
  const uncertain=createInsuranceRelay(config,async()=>{throw Error('sensitive URL with private-test-token');});
  const response=await uncertain(request(event));assert.equal(response.status,502);
  const body=await response.text();assert.ok(!body.includes('private-test-token'));assert.ok(!body.includes('"ok":false'));
});
