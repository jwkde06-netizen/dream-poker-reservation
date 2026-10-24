const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),native=require('node:module');
const root=path.resolve(__dirname,'..');
function compile(source){
 if(!native.stripTypeScriptTypes)return require('typescript').transpileModule(source,{compilerOptions:{module:1,target:7}}).outputText;
 const js=native.stripTypeScriptTypes(source,{mode:'transform'});
 const names=[...js.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/g)].map(m=>m[1]);
 return js.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,f)=>"const {"+n+"}=require('"+f+"');").replace(/export\s+(?=(?:async\s+)?(?:function|const|let)\b)/g,'')+'\nObject.assign(exports,{'+names.join(',')+'});';
}
function moduleAt(file,imports){const exports={};vm.runInNewContext(compile(fs.readFileSync(root+'/'+file,'utf8')),{exports,require:imports,URL,URLSearchParams,Date,JSON,Error,Number,Array,Set,Map});return exports;}
const plan=moduleAt('lib/accounting-plan.ts',require);
const profile=moduleAt('lib/settlement-profile.ts',require);
const view=moduleAt('lib/desk-ledger-view.ts',n=>n==='./accounting-plan'?plan:n==='./settlement-profile'?profile:require(n));
const lifecycle=moduleAt('lib/sheet-game-status.ts',n=>n==='./desk-ledger-view'?view:require(n));
const day='2026-10-24',serial=plan.serial(day);
const source={daily:[['Game','Date'],[4,serial,'4-1','5M','PARK SOO MIN','','',1],['',serial,'4-1','5M','KANG JIN HO','','',2],[1,serial+1,'2-1','5M','NEXT DAY','','',1]],fnb:[['Date'],[serial,'2F',100,'coffee']],master:[['Name'],['PARK SOO MIN','','KOREA'],['KANG JIN HO','','KOREA']],menu:[]};
const result=view.ledgerView(source,day);
assert.equal(result.daily.length,2);assert.equal(result.daily[1].game,4);assert.equal(result.daily[1].row,3);assert.equal(result.fnb.length,1);
assert.throws(()=>view.ledgerView(source,'2026-02-30'));
const booking={id:'12345678-1234-1234-1234-123456789abc',status:'checked_in',version:3,player_name_en:'PARK SOO MIN',is_test:false};
const operation={kind:'game',date:day,game:5,table:4,blind:'5M',players:[{player:'PARK SOO MIN',buyins:1}],reservationId:booking.id,reservationVersion:3};
view.assertReservationOperation(operation,booking);
for(const b of [{...booking,status:'confirmed'},{...booking,version:4},{...booking,is_test:true},{...booking,player_name_en:'KANG JIN HO'},null])assert.throws(()=>view.assertReservationOperation(operation,b));
const planner=moduleAt('lib/desk-ledger-plan.ts',n=>n==='./accounting-plan'?plan:require(n));
let admin=true,writes=0,released=0,locked=false,readbackBad=false,formats=0,displayChecks=0,existing=false,reservation={...booking},saved;
const change={range:"'일일 입력'!H2",before:[[1]],values:[[2]]};
function reset(){writes=0;released=0;locked=false;readbackBad=false;formats=0;displayChecks=0;existing=false;reservation={...booking};saved={id:booking.id,created_by:'admin',status:'preview',created_at:new Date().toISOString(),source_hash:planner.sourceHash(source),changes:[change],summary:['2바인'],operation:{kind:'buyins'}};}
const client={from:table=>{let update,contains=false;
 const q={select:()=>q,eq:()=>q,in:()=>q,gte:()=>q,lt:()=>q,order:()=>q,limit:()=>q,contains:()=>{contains=true;return q;},update:v=>{update=v;return q;},single:async()=>{if(update)Object.assign(saved,update);return {data:table==='reservations'?reservation:table==='dream_accounting_mutex'?{owner:saved.lock_owner}:saved};},then:resolve=>{if(update)Object.assign(saved,update);return Promise.resolve({data:table==='dream_sheet_game_status'?[]:table==='reservations'?[reservation]:contains?(existing?[{id:'other'}]:[]):[saved]}).then(resolve);}};return q;},rpc:async name=>{if(name.endsWith('acquire')){if(locked)return {data:false};locked=true;return {data:true};}released++;locked=false;return {data:true};}};
const route=moduleAt('app/api/accounting/ledger/route.ts',n=>{
 if(n==='next/server')return {NextResponse:{json:(body,o)=>({body,status:o?.status||200})}};
 if(n==='node:crypto')return require(n);
 if(n.endsWith('/telegram'))return {requireAdmin:async()=>admin?{id:'admin'}:null};
 if(n.endsWith('/desk-ledger-plan'))return planner;
 if(n.endsWith('/desk-ledger-view'))return view;
 if(n.endsWith('/sheet-game-status'))return lifecycle;
 if(n.endsWith('/desk-ledger-undo'))return moduleAt('lib/desk-ledger-undo.ts',require);
 if(n.endsWith('/settlement-intake'))return {readSettlementJobs:async()=>[],settlementIntake:()=>({items:[],counts:{verified:0,review:0,failed:0,processing:0,manual:0},total:0})};
 if(n.endsWith('/accounting-format'))return {prepareDateFormats:async()=>{formats++},verifyDateDisplays:async()=>{displayChecks++}};
 if(n.endsWith('/accounting-agent'))return {db:()=>client,ranges:async list=>list.length===4?[source.daily,source.fnb,source.master,source.menu]:list[0]==="'일일 입력'!A1:O5000"?[source.daily]:[writes&&!readbackBad?[[2]]:[[1]]],same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),sheet:async()=>{writes++}};
 throw Error(n);
});
const post=(action,id=saved.id)=>route.POST({text:async()=>JSON.stringify({action,id})});
module.exports=(async()=>{
 reset();admin=false;assert.equal((await route.GET({url:'https://test/api?day='+day})).status,403);assert.equal((await post('apply')).status,403);assert.equal(writes,0);admin=true;
 reset();const get=await route.GET({url:'https://test/api?day='+day});assert.equal(get.status,200);assert.equal(get.body.daily.length,2);assert.equal(get.body.reservations.length,1);assert.equal(writes,0);
 reset();assert.equal((await post('result')).body.status,'preview');assert.equal(writes,0);saved.status='writing';assert.equal((await post('result')).body.status,'writing');assert.equal(writes,0);saved.status='applied';assert.equal((await post('result')).body.applied,true);assert.equal(writes,0);
 reset();assert.equal((await post('apply')).body.applied,true);assert.equal(writes,1);assert.equal(formats,1);assert.equal(displayChecks,1);assert.equal(released,1);await post('apply');assert.equal(writes,1);
 reset();saved.source_hash='stale';assert.equal((await post('apply')).status,409);assert.equal(writes,0);
 reset();locked=true;assert.equal((await post('apply')).status,409);assert.equal(writes,0);
 reset();saved.operation=operation;reservation.version=4;assert.equal((await post('apply')).status,400);assert.equal(writes,0);assert.equal(released,1);
 reset();saved.operation=operation;existing=true;assert.equal((await post('apply')).status,400);assert.equal(writes,0);
 reset();saved.operation=operation;assert.equal((await post('apply')).body.applied,true);assert.equal(writes,1);
 reset();readbackBad=true;assert.equal((await post('apply')).status,400);assert.equal(saved.status,'writing');assert.equal(released,0);
 assert.equal((await post('reconcile')).status,409);saved.writing_started_at=new Date(Date.now()-180000).toISOString();readbackBad=false;assert.equal((await post('reconcile')).body.applied,true);assert.equal(released,1);assert.equal(displayChecks,1);
 console.log('Ledger integration: day projection, reservation identity/status/version/test guards, GET read-only, auth, stale source, shared mutex, idempotency, date formatting and uncertain-write reconciliation passed');
})();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1});
