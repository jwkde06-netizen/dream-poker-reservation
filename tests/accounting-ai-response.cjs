const assert=require('node:assert/strict');
const {completeAIJson,parseAIResponse,canRetryPhoto}=require('../.test-build/accounting-ai-response');
const good={choices:[{finish_reason:'stop',message:{content:JSON.stringify({operations:[],question:null})}}],usage:{total_tokens:10}};
(async()=>{
 let calls=0;const r=await completeAIJson(async()=>++calls===1?{choices:[{finish_reason:'length',message:{content:'{"operations":['}}],usage:{total_tokens:8}}:good,'extraction');
 assert.equal(calls,2);assert.equal(r._attempts,2);assert.equal(r._usage.totalTokens,18);
 calls=0;await assert.rejects(completeAIJson(async()=>{calls++;return {choices:[{finish_reason:'stop',message:{content:'{"operations":["'}}]};},'extraction'),/malformed_json/);assert.equal(calls,2);
 assert.throws(()=>parseAIResponse({...good,choices:[{finish_reason:'length',message:{content:'{"operations":[]}'}}]},'extraction'),/length/);
 assert.throws(()=>parseAIResponse({...good,choices:[{finish_reason:'stop',message:{content:'{"operations":{}}'}}]},'extraction'),/invalid_operations/);
 calls=0;await assert.rejects(completeAIJson(async()=>{calls++;throw Error('HTTP 401')},'extraction'),/401/);assert.equal(calls,1);
 const job={status:'failed',failure_reason:'Unterminated string in JSON at position 495',source_message:{photo:[{}]},plan:{}};
 assert.equal(canRetryPhoto(job),true);
 for(const status of ['applied','writing','uncertain','processing'])assert.equal(canRetryPhoto({...job,status}),false);
 for(const plan of [{changes:[{}]},{manual_handoff:{}},{resolvedBy:1},{photoRetryCount:3}])assert.equal(canRetryPhoto({...job,plan}),false);
 assert.equal(canRetryPhoto({...job,failure_reason:'Write outcome requires reconciliation'}),false);
 console.log('AI response: truncated/malformed JSON retry, strict completion, bounded retries, usage and safe recovery passed');
})().catch(e=>{console.error(e);process.exitCode=1});

const columns={names:['A',null],chipAmounts:[100000,null],selected:[true,false],hasSelectionMarkers:true};
const response=v=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(v)}}]});
assert.deepEqual(parseAIResponse(response(columns),'columns'),columns);
for(const invalid of [{selected:[true]},{selected:['true',false]},{chipAmounts:['100000',null]},{names:[{},null]},{hasSelectionMarkers:null}])assert.throws(()=>parseAIResponse(response({...columns,...invalid}),'columns'),/invalid_columns/);
