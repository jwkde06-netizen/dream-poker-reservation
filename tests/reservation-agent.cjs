const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function compile(path,requireFn,extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:requireFn,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-service'}},...extra});return exports;}
const model=compile('lib/reservation-agent.ts',()=>{});
assert(model.canTransition('pending','confirmed'));assert(model.canTransition('confirmed','checked_in'));
for(const s of ['cancelled','no_show','rejected','checked_in'])assert(!model.canTransition(s,'confirmed'));
const payload={reservation_id:'aabbccdd-0000-4000-8000-000000000001',version:2,event:'updated',status:'confirmed',player_name:'<Player>',arrival_at:'2026-10-21T18:30:00Z',game_title:'5M',table_no:'4',game_no:'2',guest_note:'Late arrival'};
const message=model.reservationMessage(payload);assert(message.includes('22/10'));assert(message.includes('01:30'));assert(message.includes('예약 확정'));assert(!message.includes('undefined'));
async function run({token='aabbccdd-0000-4000-8000-000000000001',job=true,sendFails=false,receiptFails=false,claimFails=false}={}){
 const calls=[];let sent=0;
 const route=compile('app/api/reservation-agent/deliver/route.ts',name=>{
  if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
  if(name==='../../../../lib/reservation-agent')return model;
  if(name==='../../../../lib/telegram')return {projectUrl:'https://test.invalid',tg:async(method,body)=>{sent++;assert(!body.parse_mode);if(sendFails)throw Error('SECRET');return {message_id:99}}};
  if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return name==='claim_reservation_delivery'?{data:job?{id:'job',claim_id:'lease',payload,target:'-123'}:null,error:claimFails?{}:null}:{data:!receiptFails,error:receiptFails?{}:null}}})};
  throw Error(name);
 });
 const response=await route.POST({json:async()=>({notification_token:token})});return {response,calls,sent};
}
(async()=>{
 let r=await run({token:'bad'});assert.equal(r.response.status,400);assert.equal(r.sent,0);
 r=await run({job:false});assert.equal(r.sent,0);assert.equal(r.response.status,200);
 r=await run({claimFails:true});assert.equal(r.sent,0);assert.equal(r.response.status,503);
 r=await run();assert.equal(r.sent,1);assert.equal(r.calls[1].args.p_message_id,99);assert(!JSON.stringify(r.response).includes('Player'));
 r=await run({sendFails:true});assert.equal(r.response.status,502);assert(r.calls[1].args.p_error);assert(!JSON.stringify(r.calls).includes('SECRET'));
 r=await run({receiptFails:true});assert.equal(r.sent,1);assert.equal(r.response.status,503);
 console.log('PASS: legal transitions, VN date rollover, payload privacy, invalid/duplicate claims, delivery, failure retry, receipt failure');
})().catch(e=>{console.error(e);process.exitCode=1});
