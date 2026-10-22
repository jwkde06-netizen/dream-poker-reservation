const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('lib/accounting-agent.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
async function run(first,latest){
 const events=[],writes=[];let reads=0;
 const client={from:()=>({
  upsert:async()=>({error:null}),
  select:()=>({eq(){return this},single:async()=>({data:reads++?latest:first,error:null})}),
  update:value=>({eq:async()=>{writes.push(value);return {error:null}}})
 }),rpc:async name=>{events.push(name);return {data:true,error:null}}};
 const exp={};const sandbox={exports:exp,Buffer,URLSearchParams,AbortSignal,Date,Intl,process:{env:{STAFF_TELEGRAM_CHAT_ID:'-5322020390'}},fetch:()=>{throw Error('Unexpected network request')},require:name=>{
  if(name==='@supabase/supabase-js')return {createClient:()=>client};
  if(name==='node:crypto')return require(name);
  if(name==='./accounting-intake')return {shouldProcessStaffMessage:()=>true};
  if(name==='./telegram')return {projectUrl:'https://example.invalid',tg:async(method)=>{events.push(method);return {message_id:999}}};
  if(name==='./accounting-easy')return {pendingButtons:()=>({})};
  return {};
 }};
 vm.runInNewContext(js,sandbox);
 let error=null;try{await exp.handle({update_id:1,message:{message_id:10,from:{id:123},chat:{id:-5322020390,type:'group'},text:'7번 게임 반영해'}})}catch(e){error=e.message}
 return {events,writes,error};
}
(async()=>{
 const first={update_id:1,status:'received',text:'7번 게임 반영해'};
 let r=await run(first,{...first,status:'applied',reply_text:'바이인 기록 완료 ✅',reply_id:11});
 assert.equal(r.error,null);assert.deepEqual(r.events,['dream_accounting_acquire','dream_accounting_release']);assert.equal(r.writes.length,0);
 r=await run(first,{...first,status:'applied',reply_text:'바이인 기록 완료 ✅'});
 assert.equal(r.error,null);assert.deepEqual(r.events,['dream_accounting_acquire','sendMessage','dream_accounting_release']);assert.equal(r.writes.length,1);assert.equal(r.writes[0].reply_id,999);
 r=await run({...first,status:'applied',reply_text:'완료 ✅'},{...first,status:'applied',reply_text:'완료 ✅',reply_id:11});
 assert.deepEqual(r.events,['dream_accounting_acquire','dream_accounting_release']);
 r=await run(first,{...first,status:'writing'});
 assert.match(r.error,/Previous write/);assert.deepEqual(r.events,['dream_accounting_acquire']);assert.equal(r.writes[0].status,'uncertain');
 console.log('Delivery race: re-read under lock, single notification recovery and unknown-write protection passed');
})().catch(e=>{console.error(e);process.exitCode=1});
