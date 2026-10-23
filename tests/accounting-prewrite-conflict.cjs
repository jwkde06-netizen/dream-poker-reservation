const assert=require('node:assert/strict'),fs=require('node:fs');
const {stripTypeScriptTypes}=require('node:module');
const {planOperations}=require('../.test-build/accounting-plan');
const {correctionBlocked}=require('../.test-build/accounting-corrections');
const source=fs.readFileSync(__dirname+'/../lib/accounting-agent.ts','utf8');
const start=source.indexOf('  let plan;try{plan=makePlan()}');
const end=source.indexOf('  sheetState=afterVerifiedWrite',start);
assert(start>0&&end>start);
const wrapped=stripTypeScriptTypes('async function isolated(){\n'+source.slice(start,end)+'\n}',{mode:'transform'});
const block=wrapped.slice(wrapped.indexOf('{')+1,wrapped.lastIndexOf('}'));
const sameSource=source.match(/export function same\([^\n]+/)[0].replace('export ','');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('env',`
 let {daily,fnb,master,result,correctionOriginal,ranges,sheet,save,finish,makePlan,correctionBlocked}=env;
 let sheetState={},businessDate='2026-10-23',taskPlan={},processingPlan={},job={update_id:1,text:''},businessRules=[],imageKey=null,writeStarted=false;
 const reconcileSheet=()=>({}),correctedOperations=ops=>ops;
 ${stripTypeScriptTypes(sameSource,{mode:'transform'})}
 ${block}
 return {plan,writeStarted};
`);
const clone=x=>JSON.parse(JSON.stringify(x));
const date='2026-10-23';
const op={kind:'add',date,game:6,table:5,blind:'5M',player:'KIM SEUNG KYU',buyins:1};
const master=[['NAME','CARD','AGENCY'],['KIM SEUNG KYU','1250','KOREA']];
const oldDaily=[['GAME']];
const manual=[['GAME'],[6,46318,'5-2','5M','KIM SEUNG KYU','1250','KOREA',1]];
const baseline=planOperations([op],oldDaily,[],master,{tableRoundLabels:true,photoSnapshot:true,partialAttendance:true});
assert(baseline.changes.length>0);
async function run(mode){
 let reads=0,writes=0,writingStates=0,finishes=[],manualPreserved=true,plans=0;
 const cells=new Map(baseline.changes.map(c=>[c.range,clone(c.before)]));
 const insertHuman=()=>{for(const c of baseline.changes)cells.set(c.range,c.range.includes('!A')?[[6,46318,'5-2','5M','HUMAN ENTERED PLAYER']]:[[3]]);};
 const env={daily:clone(oldDaily),fnb:[],master:clone(master),result:{operations:[op],question:null},correctionOriginal:[op],correctionBlocked,
  makePlan:()=>{plans++;return mode==='before-full-read'&&plans>1?planOperations([op],clone(manual),[],clone(master),{tableRoundLabels:true,photoSnapshot:true,partialAttendance:true}):clone(baseline);},
  ranges:async(list,formula)=>{reads++;if(formula)return [clone(mode==='before-full-read'?manual:oldDaily),[],clone(master)];if(reads===2&&mode==='before-preflight')insertHuman();return list.map(r=>clone(cells.get(r)));},
  save:async(id,data)=>{if(data.status==='writing'){writingStates++;if(mode==='after-preflight')insertHuman();}},
  sheet:async(endpoint,body)=>{if(mode==='during-batch')insertHuman();assert.equal(endpoint,'values:batchUpdate');writes++;for(const c of body.data){if(JSON.stringify(cells.get(c.range)).includes('HUMAN ENTERED PLAYER')||JSON.stringify(cells.get(c.range))==='[[3]]')manualPreserved=false;cells.set(c.range,clone(c.values));}},
  finish:async(status,text)=>finishes.push({status,text})};
 if(mode==='invalid-replacement'){
  env.correctionOriginal=[{...op,kind:'cancel',game:5},op];env.result.operations=[env.correctionOriginal[0]];
 }
 const returned=await execute(env);
 return {reads,writes,writingStates,plans,finishes,manualPreserved,returned};
}
module.exports=(async()=>{
 const fresh=await run('before-full-read');assert.equal(fresh.plans,2);assert.equal(fresh.writes,0);assert.equal(fresh.writingStates,0);assert.deepEqual(fresh.returned.plan.changes,[]);
 console.log('PASS actual full-sheet reread branch: manual matching entry appeared after initial plan -> replan, zero writes');
 const conflict=await run('before-preflight');assert.equal(conflict.writes,0);assert.equal(conflict.writingStates,0);assert.equal(conflict.manualPreserved,true);assert.equal(conflict.finishes[0].status,'review');assert.match(conflict.finishes[0].text,/멈췄어요/);
 console.log('PASS actual deployed prewrite path: human edit visible at target re-read -> review, zero Sheets writes, no writing state, human cells preserved');
 const blocked=await run('invalid-replacement');assert.equal(blocked.writes,0);assert.equal(blocked.writingStates,0);assert.equal(blocked.finishes[0].status,'review');
 console.log('PASS actual deployed guard: missing replacement -> zero cancellation writes');
 const normal=await run('unchanged');assert.equal(normal.writes,1);assert.equal(normal.finishes.length,0);
 console.log('PASS harness control: unchanged inputs -> one mocked batch write and readback');
 const race=await run('after-preflight');assert.equal(race.writes,0);assert.equal(race.manualPreserved,true);assert.equal(race.finishes[0].status,'review');
 console.log('PASS: edit during writing journal save is preserved, zero batch writes, conflict review');
 const residual=await run('during-batch');assert.equal(residual.writes,1);assert.equal(residual.manualPreserved,false);
 console.log('KNOWN LIMIT: edits arriving during Sheets request are not atomically protected');
 console.log('All mocked prewrite conflict tests passed');
})();
