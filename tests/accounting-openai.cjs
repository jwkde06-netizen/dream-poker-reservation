const assert=require('node:assert/strict'),fs=require('node:fs');
const {requestAccountingAI}=require('../.test-build/accounting-openai');
const {accountingModel}=require('../.test-build/accounting-model');
module.exports=(async()=>{
 const original=process.env.OPENAI_API_KEY,oldFetch=global.fetch;let calls=[];
 try{
  delete process.env.OPENAI_API_KEY;global.fetch=async(...args)=>{calls.push(args);return new Response('{}')};
  await assert.rejects(requestAccountingAI({}),{message:'OPENAI_API:authentication_required:401'});assert.equal(calls.length,0);
  process.env.OPENAI_API_KEY='sk-test-fixture';
  const photo={type:'image_url',image_url:{url:'data:image/jpeg;base64,ZmFrZQ==',detail:'high'}};
  global.fetch=async(...args)=>{calls.push(args);return new Response('{"choices":[]}')};
  await requestAccountingAI({model:accountingModel(true,{AI_GATEWAY_MODEL:'openai/gpt-6.1-sol'}),max_tokens:4000,messages:[{role:'user',content:[photo]}]});
  const [url,options]=calls[0],body=JSON.parse(options.body);
  assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer sk-test-fixture');
  assert.equal(body.model,'gpt-6.1-sol');assert.equal(body.max_completion_tokens,4000);assert(!('max_tokens'in body));assert.equal(body.store,false);assert.deepEqual(body.messages[0].content,[photo]);
  assert.throws(()=>accountingModel(false,{ACCOUNTING_MODEL:'anthropic/other'}));
  for(const [status,code,kind]of [[401,'invalid_api_key','authentication_required'],[403,'permission_denied','access_denied'],[429,'insufficient_quota','quota_exceeded'],[429,'rate_limit_exceeded','request_failed'],[503,'server_error','request_failed']]){
   calls=[];global.fetch=async(...args)=>{calls.push(args);return new Response(JSON.stringify({error:{code,message:'sk-PRIVATE'}}),{status})};
   await assert.rejects(requestAccountingAI({model:'gpt-6.1-sol'}),{message:'OPENAI_API:'+kind+':'+status});
   assert.equal(calls.length,1);assert.equal(calls[0][0],'https://api.openai.com/v1/chat/completions');
  }
  const source=fs.readFileSync('lib/accounting-agent.ts','utf8');assert.equal(source.split('return requestAccountingAI(').length-1,2);
  for(const word of ['ai-gateway.vercel','getVercelOidcToken','AI_GATEWAY_API_KEY'])assert(!source.includes(word));
  assert(source.includes('verifyChipEvidence'));assert(source.includes('afterVerifiedWrite'));
  console.log('PASS direct OpenAI: image payload, missing key, no Gateway fallback, sanitized errors and model mapping');
 }finally{global.fetch=oldFetch;if(original===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=original;}
})();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1});

