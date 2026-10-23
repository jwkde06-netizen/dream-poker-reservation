const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{randomUUID}=require('node:crypto');
function compile(file,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:req,structuredClone,Date,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},AbortSignal,URL,fetch:()=>{throw Error('unexpected fetch')}});return exports;}
const agent=compile('lib/reservation-agent.ts',()=>{}),model=compile('lib/reservation-demo.ts',()=>agent);
const now=new Date().toISOString(),arrival=new Date(Date.now()+3600000).toISOString();
const detail=(i=0,n=1)=>({name:model.demoNames[i],game_id:'dream-5m',arrival_at:arrival,party_size:n,note:'함께 도착',note_vi:'Đến cùng nhóm'});
const request=(i=0,n=1)=>({id:randomUUID(),action:'request',details:detail(i,n)});
const act=(b,action,extra={})=>({id:randomUUID(),reservation_id:b.id,expected_version:b.version,action,...extra});
const apply=(s,c,role)=>model.applyDemoCommand(s,c,role,now);
const fails=(fn,code)=>assert.throws(fn,e=>e.code===code);
let s=model.initialDemoState(),c=request(0,3);s=apply(s,c,'desk');assert.equal(s.bookings[0].status,'pending');assert.equal(model.occupiedSeats(s,'dream-5m'),0);assert.equal(s.events.length,1);
fails(()=>apply(s,request(0),'desk'),'duplicate');fails(()=>apply(s,act(s.bookings[0],'approve'),'desk'),'role');fails(()=>apply(s,request(1),'cashier'),'role');
s=apply(s,act(s.bookings[0],'approve'),'cashier');assert.equal(s.bookings[0].status,'confirmed');assert.equal(model.occupiedSeats(s,'dream-5m'),3);
fails(()=>apply(s,{id:randomUUID(),action:'approve',reservation_id:s.bookings[0].id,expected_version:0},'cashier'),'stale');
s=apply(s,act(s.bookings[0],'change',{details:detail(0,5)}),'desk');assert.equal(s.bookings[0].party_size,3);assert.equal(s.bookings[0].proposed.party_size,5);assert.equal(model.occupiedSeats(s,'dream-5m'),3);
s=apply(s,act(s.bookings[0],'reject',{reply:'변경 불가',reply_vi:'Không thể đổi'}),'cashier');assert.equal(s.bookings[0].status,'confirmed');assert.equal(s.bookings[0].party_size,3);assert.equal(s.bookings[0].request_kind,null);
s=apply(s,act(s.bookings[0],'cancel_request'),'desk');assert.equal(s.bookings[0].status,'confirmed');assert.equal(model.occupiedSeats(s,'dream-5m'),3);
s=apply(s,act(s.bookings[0],'approve'),'cashier');assert.equal(s.bookings[0].status,'cancelled');assert.equal(model.occupiedSeats(s,'dream-5m'),0);
fails(()=>apply(s,act(s.bookings[0],'change',{details:detail()}),'desk'),'inactive');
s=apply(s,request(0,6),'desk');s=apply(s,act(s.bookings[0],'approve'),'cashier');s=apply(s,request(1,4),'desk');fails(()=>apply(s,act(s.bookings[0],'approve'),'cashier'),'full');
fails(()=>apply(s,act(s.bookings[0],'reject'),'cashier'),'reason');s=apply(s,act(s.bookings[0],'suggest',{alternative_at:new Date(Date.now()+7200000).toISOString(),reply:'대안 시간',reply_vi:'Giờ thay thế'}),'cashier');assert(s.bookings[0].awaiting_desk);assert.equal(s.bookings[0].status,'pending');
fails(()=>apply(s,act(s.bookings[0],'approve'),'cashier'),'stale');s=apply(s,act(s.bookings[0],'change',{details:detail(1,3)}),'desk');s=apply(s,act(s.bookings[0],'approve'),'cashier');assert.equal(model.occupiedSeats(s,'dream-5m'),9);
const preview=model.demoTelegram(s.bookings[0],s);assert(preview.text.includes('Status: Confirmed'));assert(preview.text.includes('Guests: 3'));assert.equal(preview.keyboard.inline_keyboard[0][0].text,'CANCEL');
s=apply(s,act(s.bookings[0],'cancel'),'cashier');s=apply(s,request(2),'desk');s=apply(s,act(s.bookings[0],'cancel_request'),'desk');s=apply(s,act(s.bookings[0],'reject',{reply:'원래 예약 유지'}),'cashier');assert.equal(s.bookings[0].status,'pending');assert.equal(s.bookings[0].request_kind,'new');s=apply(s,act(s.bookings[0],'reject',{reply:'불가'}),'cashier');assert.equal(s.bookings[0].status,'rejected');
for(const bad of [{name:'REAL CUSTOMER'}, {party_size:0},{party_size:10},{party_size:1.5},{game_id:'live-game'},{arrival_at:'invalid'},{note:'x'.repeat(501)}])fails(()=>apply(model.initialDemoState(),{...request(),details:{...detail(),...bad}},'desk'),'invalid');
assert(s.events.every(e=>e.actor&&e.at&&e.details&&e.id));
console.log('PASS: waiting before cashier, bilingual details/replies, group capacity, change/cancel decisions, alternatives, role checks, stale clicks, terminal states, fake names and Telegram formatter');

// Exercise the actual API handlers with a transactional storage adapter, including receipt loss.
let current=model.initialDemoState(),revision=0,receipts=new Map(),room=randomUUID(),commits=0,failAfterCommit=false,forcedConflict=false;
const {createHash}=require('node:crypto');const token='a'.repeat(64),cashier='b'.repeat(64),hash=v=>createHash('sha256').update(v).digest('hex');
const snap=role=>({role,state:structuredClone(current),revision,expires_at:new Date(Date.now()+7200000).toISOString()});
const route=compile('app/api/reservation-demo/route.ts',name=>{
 if(name==='next/server')return {NextResponse:{json:(body,opt)=>({body,status:opt?.status||200})}};
 if(name==='node:crypto')return require(name);
 if(name.includes('reservation-demo'))return model;
 if(name==='@supabase/supabase-js')return {createClient:()=>({rpc:async(method,p)=>{
  const role=p.p_key_hash===hash(token)?'desk':p.p_key_hash===hash(cashier)?'cashier':null;
  if(!role||p.p_room!==room)return {data:null};
  const rec=receipts.get(p.p_request);
  if(rec&&rec!==p.p_fingerprint)return {error:{message:'Idempotency key mismatch'}};
  if(method==='load_reservation_demo')return {data:{...snap(role),replayed:!!rec}};
  if(method==='commit_reservation_demo'){
   if(rec)return {data:{...snap(role),replayed:true}};
   if(forcedConflict){forcedConflict=false;revision++;return {data:{conflict:true}};}
   if(p.p_expected_revision!==revision)return {data:{conflict:true}};
   current=p.p_state;revision++;commits++;receipts.set(p.p_request,p.p_fingerprint);
   if(failAfterCommit){failAfterCommit=false;throw Error('response lost');}
   return {data:snap(role)};
  }
  throw Error('Unexpected RPC '+method);
 }})};throw Error(name);
});
const call=(command,role='desk',origin='https://demo.test')=>route.POST(new Request(`https://demo.test/api/reservation-demo?room=${room}`,{method:'POST',headers:{authorization:`Bearer ${role==='desk'?token:cashier}`,origin},body:JSON.stringify({command})}));
(async()=>{
 let c=request();failAfterCommit=true;let r=await call(c);assert.equal(r.status,503);assert.equal(commits,1);r=await call(c);assert.equal(r.status,200);assert.equal(commits,1);assert.equal(current.bookings.length,1);assert.equal(current.events.length,1);
 r=await call({...c,details:detail(1)});assert.equal(r.status,409);assert.equal(commits,1);
 r=await call(act(current.bookings[0],'approve'));assert.equal(r.status,422);assert.equal(commits,1);
 forcedConflict=true;r=await call(act(current.bookings[0],'approve'),'cashier');assert.equal(r.status,200);assert.equal(current.bookings[0].status,'confirmed');assert.equal(commits,2);
 r=await call(request(1),'desk','https://foreign.test');assert.equal(r.status,403);
 const invalid=await route.GET(new Request(`https://demo.test/api/reservation-demo?room=${room}`,{headers:{authorization:'Bearer '+ 'c'.repeat(64)}}));assert.equal(invalid.status,403);
 console.log('PASS: API acknowledgement loss then same-ID retry, receipt fingerprint, cashier role, compare-and-swap conflict retry, origin/key rejection; no operational RPCs');
})().catch(e=>{console.error(e);process.exitCode=1});
