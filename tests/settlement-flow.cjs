const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache={};
function load(name){if(name==='node:crypto')return require(name);if(cache[name])return cache[name];const output={};cache[name]=output;new Function('require','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name.replace('./','')+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(load,output);return output;}
const {settlementIntake,readSettlementJobs}=load('./settlement-intake'),{buildSettlement}=load('./settlement-domain'),{settlementProfile:p}=load('./settlement-profile');
const date='2026-10-24',op={kind:'add',date,game:11,table:13,blind:'5M',player:'YANG JUNMO',buyins:1};
const row=(game,name,buyins=1,serial=46319)=>[game,serial,'13-4','5M',name,'','KOREA',buyins,buyins*500000,buyins*250000,0,0,0,0,0];
const daily=[p.dailyHeaders,row(11,'YANG JUNMO'),row('','LEE SUNG WON'),row(1,'NEXT DAY',1,46320)];
const master=[['PLAYER','CARD','AGENCY'],['YANG JUNMO','','KOREA'],['LEE SUNG WON','','KOREA']];
const jobs=[
 {update_id:1,message_id:436,status:'review',created_at:date+'T14:58:15Z',plan:{operations:[{...op,player:'YUN SANG WOO'}],resolvedBy:444}},
 {update_id:2,message_id:438,status:'review',created_at:date+'T15:06:56Z',plan:{operations:[op],contextMessageId:436,resolvedBy:444}},
 {update_id:3,message_id:444,status:'applied',created_at:date+'T15:09:42Z',plan:{contextMessageId:438,operations:[op,{...op,player:'LEE SUNG WON'}],pendingQuestion:'THOMAS VAN NEDERVELDE 소속 코드를 알려주세요.',deferredRegistrations:[{player:'THOMAS VAN NEDERVELDE'}]}}
];
let intake=settlementIntake(jobs,daily,master,date,date);
assert.equal(intake.total,1);assert.equal(intake.counts.review,1);assert.equal(intake.items[0].checked,2);assert.equal(intake.items[0].rootMessageId,436);assert.deepEqual(intake.items[0].games,[11]);
const complete=JSON.parse(JSON.stringify(jobs));complete[2].plan.pendingQuestion=null;complete[2].plan.deferredRegistrations=[];
assert.equal(settlementIntake(complete,daily,master,date,date).counts.verified,1);
const stale=daily.map(r=>[...r]);stale[1][7]=2;assert.equal(settlementIntake(complete,stale,master,date,date).counts.changed,1,'applied log alone cannot claim current counts match');
const midnight={message_id:500,update_id:4,status:'review',created_at:'2026-10-24T18:01:00Z',plan:{operations:[op],pendingQuestion:'칩 수 확인'}};
assert.equal(settlementIntake([midnight],daily,master,date,date).total,1,'after-midnight upload follows receipt business date');
assert.equal(settlementIntake([midnight],daily,master,'2026-10-25','2026-10-25').total,0);
assert.equal(settlementIntake([{...midnight,status:'failed',plan:{operations:[op]}},{message_id:600,status:'ignored',plan:{casualConversation:true}}],daily,master,date,date).counts.verified,1,'later manual matching entry resolves a failed pre-write attempt');
const report=buildSettlement(date,daily,[['date','floor','amount','note'],[46319,'2F',50000,'coffee'],[46319,'3F',60000,'separate'],[46320,'4F',70000,'next day']],[],100000,intake.items,'2026-10-26');
const d=report.days.find(d=>d.date===date);assert.equal(d.games,1);assert.equal(d.participants,2);assert.equal(d.buyins,2);assert.equal(d.fnbDeductible,50000);assert.equal(d.fnbExcluded,60000);assert.equal(d.net,450000);assert.equal(d.issues.length,1);assert.equal(d.issues[0].game,11);
assert.equal(report.days.reduce((n,d)=>n+d.buyins,0),report.totals.buyins);
assert.equal(report.days.reduce((n,d)=>n+d.net,0)-report.salary,report.net,'daily sums and weekly salary reconciliation');
assert.equal(report.canConfirm,false,'pending scan still blocks weekly sign-off');
const broken=daily.map(r=>[...r]);broken[1][9]='#REF!';const bad=buildSettlement(date,broken,[],[],0,[],'2026-10-26');assert.equal(bad.days.find(d=>d.date===date).issues[0].kind,'amount');assert.equal(bad.days.find(d=>d.date==='2026-10-25').issues.length,0,'issues remain on their own business date');
const undated=buildSettlement(date,[...daily,row(99,'UNDATED',1,'')],[],[],0,[],'2026-10-26');assert.equal(undated.issues.filter(i=>i.kind==='date').length,1);assert.equal(undated.days.find(d=>d.date===date).issues.length,0,'undated records must not be attributed to every business date');assert.equal(undated.canConfirm,false,'unassigned dates still block weekly confirmation');
module.exports=(async()=>{let scans=0;const client={from:()=>{const q={select:()=>q,gte:()=>q,lt:()=>q,order:()=>q,range:async(a)=>{scans++;return {data:a===0?Array.from({length:500},(_,i)=>({message_id:i})):jobs};}};return q;}};assert.equal((await readSettlementJobs(client,date,date)).length,503);assert.equal(scans,2);console.log('Settlement flow passed: corrected-photo chain, current-sheet verification, overnight business dates, daily/weekly equal sums, 3F exclusion, scoped issues and paged reads.');})();
