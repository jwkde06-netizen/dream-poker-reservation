const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const id='49cd3542-385b-4021-a7cb-9171946e25a0';
const load=(file,requireFn)=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:requireFn,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}}});return exports;};
const model=load('lib/reservation-agent.ts',()=>{});
for(const status of ['pending','waitlisted','confirmed']){
 const buttons=model.reservationActionKeyboard(id,{status}).inline_keyboard[0];
 assert.equal(buttons[0].text,status==='confirmed'?'CANCEL':'CONFIRM');assert.equal(buttons[0].callback_data,`rr:${status==='confirmed'?'cancel':'confirm'}:${id}`);assert.equal(buttons.length,2);assert.equal(buttons[1].text,'CONTACT DESK');
 for(const b of buttons){assert(!b.url);assert(Buffer.byteLength(b.callback_data)<=64);}
}
assert.equal(model.reservationActionKeyboard(id,{status:'confirmed',contact_required:true}).inline_keyboard[0][0].text,'CANCEL');
for(const status of ['cancelled','rejected','checked_in','no_show'])assert.equal(model.reservationActionKeyboard(id,{status}).inline_keyboard.length,0);
const payload={reservation_id:id,version:0,event:'updated',status:'pending',contact_required:true,player_name:'TEST ONLY',game_title:'Next 5M',arrival_at:new Date().toISOString()};
assert(model.reservationMessage(payload).includes('Status: Contact desk'));
assert(model.reservationMessage(payload).includes('KakaoTalk'));
async function run({data=`rr:confirm:${id}`,chat=-123,actor=42,bot=false,valid=true,member='member',result='confirmed',fail,answerFails=false}={}){
 const calls=[];
 const api=load('lib/reservation-telegram-actions.ts',name=>{
  if(name==='./telegram')return {projectUrl:'https://test.invalid',tg:async(method,p)=>{calls.push([method,p]);if(method==='getChatMember')return {status:member};if(answerFails)throw Error('expired');return true;}};
  if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(method,p)=>{calls.push([method,p]);return {data:method==='reservation_telegram_action_context'?valid:{result},error:method===fail?{}:null};}})};
  throw Error(name);
 });
 const handled=await api.handlePublicReservationCallback({callback_query:{id:'query',data,from:{id:actor,is_bot:bot,first_name:'STAFF'},message:{message_id:238,chat:{id:chat}}}});
 return {calls,handled};
}
(async()=>{
 let r=await run();assert(r.handled);assert.equal(r.calls[2][0],'apply_reservation_telegram_action');assert.equal(r.calls[2][1].p_action,'confirm');assert.equal(r.calls[2][1].p_actor,42);assert.equal(r.calls.at(-1)[1].text,'Reservation confirmed.');
 r=await run({data:`rr:cancel:${id}`,result:'cancelled'});assert.equal(r.calls[2][1].p_action,'cancel');assert.equal(r.calls.at(-1)[1].text,'Reservation cancelled.');
 r=await run({data:`rr:contact:${id}`,result:'contact'});assert.equal(r.calls[2][1].p_action,'contact');assert(r.calls.at(-1)[1].text.includes('KakaoTalk'));
 for(const opts of [{data:'lr:confirm:test'},{data:'accounting:approve'}, {data:'rr:bad'},{bot:true},{actor:-1},{chat:42},{valid:false},{member:'left'},{member:'restricted'},{member:'kicked'},{data:`rr:cancel:${id}`,valid:false},{data:`rr:cancel:${id}`,member:'left'}]){
  r=await run(opts);assert(!r.calls.some(c=>c[0]==='apply_reservation_telegram_action'),JSON.stringify(opts));
 }
 for(const result of ['full','stale','inactive','unchanged','closed']){r=await run({result});assert(!r.calls.at(-1)[1].text.includes('Reservation confirmed.'));}
 await assert.rejects(run({fail:'reservation_telegram_action_context'}));await assert.rejects(run({fail:'apply_reservation_telegram_action'}));
 r=await run({answerFails:true});assert(r.handled);assert.equal(r.calls.filter(c=>c[0]==='apply_reservation_telegram_action').length,1);
 console.log('PASS: two callbacks, no redirects, contact status, receipt validation, staff membership, errors and accounting isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
