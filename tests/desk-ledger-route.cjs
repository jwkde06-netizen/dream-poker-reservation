const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
let admin=true,writes=0,released=0,locked=false,badRead=false;
const change={range:"'일일 입력'!H2",before:[[1]],values:[[2]]};let plan;
function reset(){writes=0;released=0;locked=false;badRead=false;plan={id:'12345678-1234-1234-1234-123456789abc',created_by:'admin',status:'preview',created_at:new Date().toISOString(),source_hash:'fresh',changes:[change],summary:['2바인']};}
const client={from:table=>{let update;const q={select:()=>q,eq:()=>q,update:v=>{update=v;return q},single:async()=>{if(update)Object.assign(plan,update);return {data:table==='dream_accounting_mutex'?{owner:plan.lock_owner}:plan}},then:resolve=>{if(update)Object.assign(plan,update);return Promise.resolve({data:plan}).then(resolve)}};return q;},rpc:async name=>{if(name.endsWith('acquire')){if(locked)return {data:false};locked=true;return {data:true};}released++;locked=false;return {data:true};}};
const route={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/accounting/ledger/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:route,Date,JSON,Error,require:n=>{
if(n==='next/server')return {NextResponse:{json:(body,o)=>({body,status:o?.status||200})}};
if(n==='node:crypto')return require(n);
if(n.endsWith('/telegram'))return {requireAdmin:async()=>admin?{id:'admin'}:null};
if(n.endsWith('/desk-ledger-plan'))return {sourceHash:()=> 'fresh'};
if(n.endsWith('/accounting-agent'))return {db:()=>client,ranges:async list=>list.length===4?[[],[],[],[]]:[writes&&!badRead?[[2]]:[[1]]],same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),sheet:async()=>{writes++;}};
throw Error(n);
}});
const post=action=>route.POST({text:async()=>JSON.stringify({action,id:plan.id})});
(async()=>{
reset();admin=false;assert.equal((await post('apply')).status,403);assert.equal(writes,0);admin=true;
reset();assert.equal((await post('apply')).body.applied,true);assert.equal(writes,1);assert.equal(released,1);assert.equal(plan.status,'applied');await post('apply');assert.equal(writes,1);
reset();plan.source_hash='stale';assert.equal((await post('apply')).status,409);assert.equal(writes,0);assert.equal(released,1);
reset();locked=true;assert.equal((await post('apply')).status,409);assert.equal(writes,0);
reset();badRead=true;assert.equal((await post('apply')).status,400);assert.equal(plan.status,'writing');assert.equal(released,0);assert.equal((await post('reconcile')).status,409);assert.equal(released,0);
plan.writing_started_at=new Date(Date.now()-180000).toISOString();badRead=false;assert.equal((await post('reconcile')).body.applied,true);assert.equal(released,1);
console.log('Desk route: authentication, idempotency, changed source, shared lock, uncertain write hold and delayed reconciliation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
