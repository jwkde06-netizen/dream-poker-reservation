const assert=require('node:assert/strict');
const {classifyOpenAIFailure,openaiError,openaiNotConfigured,gatewayStaffMessage,gatewayStatus,AccountingGatewayError}=require('../.test-build/accounting-gateway-error');
const {accountingModel,ACCOUNTING_DEFAULT_MODEL,OPENAI_CHAT_URL}=require('../.test-build/accounting-model');
const {completeAIJson}=require('../.test-build/accounting-ai-response');
const {canRecoverGatewayPhoto}=require('../.test-build/accounting-recovery');
(async()=>{
 assert.equal(OPENAI_CHAT_URL,'https://api.openai.com/v1/chat/completions');
 // Models: bare OpenAI ids only, Gateway setting ignored, retired ids and foreign providers fall back to the default.
 assert.equal(ACCOUNTING_DEFAULT_MODEL,'gpt-6.1-sol');
 assert.equal(accountingModel(true,{}),'gpt-6.1-sol');
 assert.equal(accountingModel(true,{AI_GATEWAY_MODEL:'openai/gpt-6-astra'}),'gpt-6.1-sol','AI Gateway setting must not leak into direct calls');
 assert.equal(accountingModel(true,{ACCOUNTING_MODEL:'openai/gpt-6-astra'}),'gpt-6-astra');
 assert.equal(accountingModel(true,{ACCOUNTING_VISION_MODEL:'gpt-6.1-terra',ACCOUNTING_MODEL:'gpt-6-astra'}),'gpt-6.1-terra');
 assert.equal(accountingModel(false,{ACCOUNTING_VISION_MODEL:'gpt-6.1-terra',ACCOUNTING_TEXT_MODEL:'gpt-6-luna'}),'gpt-6-luna');
 for(const bad of ['gpt-5-mini','openai/gpt-5.4','anthropic/claude-x','bad model','../x'])assert.equal(accountingModel(true,{ACCOUNTING_MODEL:bad}),'gpt-6.1-sol',bad);

 // Failure classification uses only status and the machine-readable code.
 assert.equal(classifyOpenAIFailure(429,{error:{code:'insufficient_quota',message:'You exceeded your current quota'}}),'quota_exceeded');
 assert.equal(classifyOpenAIFailure(429,{error:{type:'insufficient_quota'}}),'quota_exceeded');
 assert.equal(classifyOpenAIFailure(429,{error:{code:'rate_limit_exceeded'}}),'request_failed');
 assert.equal(classifyOpenAIFailure(401,{}),'authentication_required');
 assert.equal(classifyOpenAIFailure(403,{}),'access_denied');
 assert.equal(classifyOpenAIFailure(404,{error:{code:'model_not_found'}}),'access_denied');
 assert.equal(classifyOpenAIFailure(503,{}),'request_failed');
 const quota=await openaiError(new Response(JSON.stringify({error:{code:'insufficient_quota',message:'quota sk-proj-SECRET'}}),{status:429}));
 assert.equal(quota.message,'AI_PROVIDER:quota_exceeded:429');
 assert(!quota.message.includes('SECRET'));
 assert.match(gatewayStaffMessage(quota),/크레딧이나 한도/);
 assert(!gatewayStaffMessage(quota).includes('다시 올려'));
 assert.equal(gatewayStatus(quota.message),'AI 연결: OpenAI 크레딧·한도 확인 필요 ⚠️');
 const html=await openaiError(new Response('<html>private</html>',{status:502}));
 assert.equal(html.message,'AI_PROVIDER:request_failed:502');
 const missing=openaiNotConfigured();
 assert.equal(missing.message,'AI_PROVIDER:not_configured:0');
 assert.equal(gatewayStatus(missing.message),'AI 연결: OpenAI 키 확인 필요 ⚠️');
 assert.equal(gatewayStatus('AI_PROVIDER:authentication_required:401'),'AI 연결: OpenAI 키 확인 필요 ⚠️');
 assert.equal(gatewayStatus('AI_GATEWAY:paid_credits_required:403'),'AI 연결: 유료 크레딧 충전 필요 ⚠️','old Gateway failures keep their label');

 // Credit/key/access failures are never retried (a retry would only repeat the failed paid call); transient ones retry once.
 const ok={model:'gpt-6.1-sol',usage:{total_tokens:3,prompt_tokens:2,completion_tokens:1},choices:[{finish_reason:'stop',message:{content:'{"operations":[],"question":null}'}}]};
 for(const err of [quota,missing,await openaiError(new Response('{}',{status:401})),await openaiError(new Response('{}',{status:403}))]){
  let calls=0;
  await assert.rejects(()=>completeAIJson(async()=>{calls++;throw err;},'extraction'),e=>e===err);
  assert.equal(calls,1,err.message+' must not be retried');
 }
 let calls=0;
 const rate=await openaiError(new Response(JSON.stringify({error:{code:'rate_limit_exceeded'}}),{status:429}));
 const result=await completeAIJson(async()=>{calls++;if(calls===1)throw rate;return ok;},'extraction');
 assert.equal(calls,2);assert.equal(result._model,'gpt-6.1-sol');

 // Photos saved before the provider switch (Gateway) and after it (OpenAI) can both resume once the problem is fixed.
 const job={update_id:1,message_id:299,status:'failed',sender_id:'7',source_message:{date:1,photo:[{}]},plan:{}};
 for(const reason of ['AI_GATEWAY:paid_credits_required:403','AI_GATEWAY:quota_exceeded:402','AI_PROVIDER:quota_exceeded:429','AI_PROVIDER:not_configured:0','AI_PROVIDER:authentication_required:401','AI_PROVIDER:access_denied:404'])assert(canRecoverGatewayPhoto({...job,failure_reason:reason}),reason);
 for(const reason of ['AI_PROVIDER:request_failed:503','AI_PROVIDER:quota_exceeded:500','AI_PROVIDER:not_configured:429'])assert(!canRecoverGatewayPhoto({...job,failure_reason:reason}),reason);
 assert(!canRecoverGatewayPhoto({...job,failure_reason:'AI_PROVIDER:quota_exceeded:429',plan:{changes:[{}]}}),'never resume after a write');
 console.log('Direct OpenAI: model ids, failure classification without secrets, no retry on credit/key errors, bounded transient retry and photo recovery passed');
})().catch(e=>{console.error(e);process.exitCode=1});
