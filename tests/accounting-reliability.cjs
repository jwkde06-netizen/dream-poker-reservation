const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {completeAIJson,canRetryPhoto}=require('../lib/accounting-ai-response.ts');
const {completionReply}=require('../lib/accounting-conversation.ts');
const {followupContext}=require('../lib/accounting-followup.ts');
(async()=>{
 const good={choices:[{finish_reason:'stop',message:{content:'{"operations":[],"question":null}'}}]};
 for(const reason of ['HTTP 429','HTTP 503','fetch failed']){
  let calls=0;await completeAIJson(async()=>{if(++calls===1)throw Error(reason);return good;},'extraction');assert.equal(calls,2);
 }
 let calls=0;await assert.rejects(completeAIJson(async()=>{calls++;throw Error('HTTP 401');},'extraction'),/401/);assert.equal(calls,1);
 calls=0;await assert.rejects(completeAIJson(async()=>{calls++;throw Error('HTTP 503');},'extraction'),/503/);assert.equal(calls,2);
 assert.equal(completionReply([{kind:'add',game:12},{kind:'add',game:13}],null,false),'12번 게임 바이인 기록 완료 ✅\n13번 게임 바이인 기록 완료 ✅');
 assert.equal(completionReply([{kind:'total',game:8,player:'JUNG CHAN SU',buyins:3}],null,false),'8번 게임 리바인 체크 완료 ✅\nJUNG CHAN SU 총 3바인');
 const pending={message_id:1,status:'review',sender_id:'2',plan:{pendingQuestion:'몇 바인인가요?'}};
 assert.equal(followupContext([pending],{photo:[{}],from:{id:2}},[]),null);
 assert.equal(followupContext([{...pending,plan:{...pending.plan,resolvedBy:'manual'}}],{text:'2바인',reply_to_message:{message_id:1}},[]),null);
 assert.equal(canRetryPhoto({status:'failed',failure_reason:'AI_RESPONSE_INVALID:verification_unavailable',source_message:{photo:[{}]},plan:{}}),true);
 assert.equal(canRetryPhoto({status:'applied',failure_reason:'AI_RESPONSE_INVALID:verification_unavailable',source_message:{photo:[{}]},plan:{}}),false);
 const source=fs.readFileSync(require('path').join(__dirname,'../lib/accounting-agent.ts'),'utf8');
 assert(source.includes("throw new InvalidAIResponse('verification_unavailable')"));
 assert(!source.includes('result.unverifiedOperations?.[0]?.player?'));
 console.log('Reliability: bounded retries, no retry on auth, game replies, isolated follow-ups, no chip question on infrastructure failure passed');
})().catch(e=>{console.error(e);process.exitCode=1});

