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
const context=lifecycle;
module.exports=(async()=>{
var source={daily:[[8,plan.serial('2026-10-24'),'5-3','5M','A','','',1],[9,plan.serial('2026-10-24'),'18-1','5M','B','','',2],[10,plan.serial('2026-10-24'),'12-1','5M','C','','',1]],fnb:[],master:[],menu:[]};
var state=[];var mutations=0;
var client={from(name){assert.equal(name,'dream_sheet_game_status');let filters=[],value,kind='read';const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle(){return Promise.resolve({data:state.find(x=>filters.every(([k,v])=>x[k]===v))||null})},insert(v){kind='insert';value=v;return q},update(v){kind='update';value=v;return q},then(resolve,reject){let matches=state.filter(x=>filters.every(([k,v])=>x[k]===v));if(value.status==='active'&&state.some(x=>x.game_no!==value.game_no&&x.business_date===value.business_date&&x.physical_table===value.physical_table&&x.status==='active'))return Promise.resolve({error:{code:'23505'}}).then(resolve,reject);if(kind==='insert'){if(state.some(x=>x.game_no===value.game_no))return Promise.resolve({error:{code:'23505'}}).then(resolve,reject);state.push(value);matches=[value]}else matches.forEach(x=>Object.assign(x,value));mutations++;return Promise.resolve({data:matches.map(x=>({version:x.version}))}).then(resolve,reject)}};return q}};
var change=context.changeSheetGameStatus;
await change(client,source,{day:'2026-10-24',game:8,status:'active',version:null},'tester');
await change(client,source,{day:'2026-10-24',game:9,status:'active',version:null},'tester');
assert.deepEqual(state.filter(x=>x.status==='active').map(x=>x.game_no),[8,9]);assert(!state.some(x=>x.game_no===10));
await assert.rejects(()=>change(client,source,{day:'2026-10-24',game:8,status:'closed',version:null},'tester'),/다른 직원/);
var oldVersion=state[0].version;await change(client,source,{day:'2026-10-24',game:8,status:'closed',version:oldVersion},'tester');assert.equal(state[0].status,'closed');
await assert.rejects(()=>change(client,source,{day:'2026-10-24',game:8,status:'active',version:oldVersion},'tester'),/다른 직원/);
await change(client,source,{day:'2026-10-24',game:8,status:'active',version:state[0].version},'tester');assert.equal(state[0].history.length,3);
await assert.rejects(()=>change(client,source,{day:'2026-10-24',game:99,status:'active',version:null},'tester'),/확인할 수/);
var conflict={...source,daily:[...source.daily,[11,plan.serial('2026-10-24'),'5-4','5M','D','','',1]]};
await assert.rejects(()=>change(client,conflict,{day:'2026-10-24',game:11,status:'active',version:null},'tester'),/이미 진행/);
var ambiguous={...source,daily:[...source.daily,[8,plan.serial('2026-10-24'),'13-1','5M','D','','',1]]};
await assert.rejects(()=>change(client,ambiguous,{day:'2026-10-24',game:8,status:'active',version:state[0].version},'tester'),/하나로 확인/);
await change(client,source,{action:'game_reference',day:'2026-10-24',game:8,sourceNo:'28',version:state[0].version},'tester');
assert.equal(state[0].game_no,8);assert.equal(state[0].source_no,'28');assert.equal(state[0].status,'active');
await change(client,source,{action:'game_reference',day:'2026-10-24',game:10,sourceNo:'31',version:null},'tester');
assert.equal(state.find(x=>x.game_no===10).status,'unconfirmed');
const beforePrepared=JSON.stringify(source);
const prepared=state.find(x=>x.game_no===10);
await change(client,source,{day:'2026-10-24',game:10,status:'prepared',version:prepared.version},'tester');
assert.equal(prepared.status,'prepared');
assert.deepEqual(state.filter(x=>x.status==='active').map(x=>x.game_no),[8,9]);
assert.equal(prepared.source_no,'31');
assert.equal(prepared.history.at(-1).to,'prepared');
assert.equal(JSON.stringify(source),beforePrepared);
const preparedVersion=prepared.version;
await change(client,source,{action:'game_reference',day:'2026-10-24',game:10,sourceNo:'32',version:prepared.version},'tester');
assert.equal(prepared.status,'prepared');
await assert.rejects(()=>change(client,source,{day:'2026-10-24',game:10,status:'active',version:preparedVersion},'tester'),/다른 직원/);
await change(client,source,{day:'2026-10-24',game:10,status:'active',version:prepared.version},'tester');
assert.equal(prepared.status,'active');
await change(client,source,{day:'2026-10-24',game:10,status:'prepared',version:prepared.version},'tester');
assert.equal(prepared.status,'prepared');
await assert.rejects(()=>change(client,source,{day:'2026-10-24',game:10,status:'invented',version:prepared.version},'tester'),/요청/);
await change(client,source,{day:'2026-10-24',game:8,status:'closed',version:state[0].version},'tester');
assert.equal(state[0].source_no,'28');
await assert.rejects(()=>change(client,source,{action:'game_reference',day:'2026-10-24',game:8,sourceNo:'invalid',version:state[0].version},'tester'),/No\./);
console.log('PASS: separate casino reference, internal number preserved, lifecycle preserved, invalid reference rejected;  multiple live games, no automatic game 10, close/reopen, stale version rejection, missing/ambiguous game rejection, table conflict, audit history. No external writes.');

})();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1});
