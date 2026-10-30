const assert=require('node:assert/strict');
const {attendancePlayers,canonicalPlayers,correctedOperations}=require('../.test-build/accounting-context');
const {prepareSelectedPhotoRegistrations,completePhotoRoster,verifyChipEvidence}=require('../.test-build/accounting-vision');
const {isolateUnapprovedRegistrations,registrationApprovals}=require('../.test-build/accounting-followup');
const {planOperations,serial}=require('../.test-build/accounting-plan');
const {reconcileOperation}=require('../.test-build/accounting-reconcile');
const rules=[{content:'종이 바이인 명단에서 동그라미로 선택된 선수가 기존 플레이어 명단에 없으면 신규 플레이어로 등록한다.'},{content:'별다른 언급 없으면 소속 코드를 기본값 KOREA로 처리'}];
const date='2026-10-30',base={kind:'add',date,game:3,table:13,printedGame:3,blind:'5M',buyins:1,chips:100000};
const master=[['PLAYER','CARD','AGENCY'],['KIM SUNG MIN','3477','KOREA'],['KIM SUNG MIN','2435','KOREA'],['KNOWN UK','99','UK']];
const paper={date,table:13,printedGame:3,handwrittenGame:3,names:['KIM SUNGMIN','JEON SANGYEOL'],chipAmounts:[100000,100000],selected:[true,true],hasSelectionMarkers:true};
const ops=[{...base,player:'KIM SUNG MIN'},{kind:'register',player:'JEON SANGYEOL',agency:'KOREA'},{...base,player:'JEON SANGYEOL'}];
assert.equal(canonicalPlayers(master).filter(r=>r[0]==='KIM SUNG MIN').length,2,'master card identities remain separate');
const view=attendancePlayers(master);assert.equal(view.filter(r=>r[0]==='KIM SUNG MIN').length,1);assert.equal(view[0][1],'','do not choose either card');
let prepared=prepareSelectedPhotoRegistrations(ops,{documents:[paper]},master,rules);
assert.equal(prepared.approvals.JEONSANGYEOL.agency,'KOREA');
assert(!prepared.approvals.KIMSUNGMIN);
let covered=completePhotoRoster(prepared.operations,{documents:[paper]},prepared.master,rules);
assert.deepEqual(covered.questions,[]);
let verified=verifyChipEvidence(covered.operations,{documents:[paper]},rules);assert.deepEqual(verified.questions,[]);
let checked=isolateUnapprovedRegistrations(verified.operations,'',master,'',rules,prepared.approvals);
assert.equal(checked.question,null);assert.equal(checked.operations.filter(o=>o.kind==='register').length,1);
const approved=registrationApprovals(checked.operations,'',master,'',rules,prepared.approvals);
let plan=planOperations(checked.operations,[['NUMBER']],[],master,{partialAttendance:true,registrationApprovals:approved});
assert(plan.changes.some(c=>c.range.startsWith("'플레이어 명단'!")&&c.values[0][2]==='KOREA'));
assert.equal(plan.changes.filter(c=>c.range.startsWith("'일일 입력'!H")).length,2);
assert.throws(()=>registrationApprovals(checked.operations,'',master,'',rules),/소속 코드/,'model text alone is not photo approval');
// A manual entry already present is preserved, not registered or added twice.
const known=[...master,['JEON SANG YEOL','','KOREA']];
const current=[['NUMBER'],[3,serial(date),'13','5M','KIM SUNG MIN','','KOREA',1],['',serial(date),'13','5M','JEON SANG YEOL','','KOREA',1]];
prepared=prepareSelectedPhotoRegistrations(correctedOperations(ops,'',known,rules),{documents:[paper]},known,rules);
covered=completePhotoRoster(prepared.operations,{documents:[paper]},prepared.master,rules);
plan=planOperations(covered.operations,current,[],known,{photoSnapshot:true,partialAttendance:true});
assert.equal(plan.changes.length,0);
for(const mutation of [
 {selected:[true,false]},
 {hasSelectionMarkers:false},
 {chipAmounts:[100000,200000]},
 {crossedOut:[false,true]},
 {crossedOut:[false,'false']},
 {selected:[true,'true']},
 {table:12},
 {date:'2026-10-29'},
 {printedGame:4,handwrittenGame:null},
 {headerCorrections:[{field:'game',value:3},{field:'game',value:4}]}
]){
 const p=prepareSelectedPhotoRegistrations(ops,{documents:[{...paper,...mutation}]},master,rules);
 assert.deepEqual(p.approvals,{},JSON.stringify(mutation));
}
assert.deepEqual(prepareSelectedPhotoRegistrations(ops,{documents:[paper,paper]},master,rules).approvals,{});
assert.deepEqual(prepareSelectedPhotoRegistrations(ops,{documents:[paper]},master,[]).approvals,{});
assert.deepEqual(prepareSelectedPhotoRegistrations(ops,{documents:[paper]},master,rules.slice(0,1)).approvals,{});
const noProof=isolateUnapprovedRegistrations(ops,'',master,'',rules);
assert(noProof.question.includes('JEON SANGYEOL'));
const differentCodes=[...master,['KIM SUNG MIN','5','HOUSE']];
assert.equal(attendancePlayers(differentCodes).filter(r=>r[0]==='KIM SUNG MIN').length,3);
assert(completePhotoRoster([ops[0]],{...paper,names:['KIM SUNGMIN'],chipAmounts:[100000],selected:[true]},differentCodes).questions.length);
const notMerged=[['PLAYER','CARD','AGENCY'],['KIM HYUN JUN','','KOREA']];
const bPaper={...paper,names:['KIM HYUNJUN B'],chipAmounts:[100000],selected:[true]};
const b=prepareSelectedPhotoRegistrations([{...base,player:'KIM HYUNJUN B'}],{documents:[bPaper]},notMerged,rules);
assert(b.operations.some(o=>o.kind==='register'&&o.player==='KIM HYUNJUN B'),'suffix B is not stripped or merged');
// Preserve the manual spelling correction without inventing a rejoin or alias.
const original={...base,game:2,table:5,player:'KIM DAE HUYN',kind:'total'};
const old={date,game:2,tableLabel:'5-1',blind:'5M',player:'KIM DAE HUYN',buyins:1};
const state={version:1,date,aliases:[],entries:[{...old,player:'KIM DAE HYUN'}],overrides:[{entry:old,kind:'removed',reason:'sheet_edit',observedAt:'2026-10-30T08:00:00Z'}]};
let r=reconcileOperation(original,{state,photo:true,text:''});
assert(r.skip);assert.equal(r.question,undefined);assert.equal(r.op.player,'KIM DAE HUYN','no automatic identity merge');
r=reconcileOperation({...original,buyins:2},{state,photo:true,text:''});assert(r.skip);assert(r.question,'a higher ambiguous count still needs confirmation');
r=reconcileOperation(original,{state,photo:false,text:''});assert(r.question);
r=reconcileOperation(original,{state:{...state,entries:[{...old,player:'DIFFERENT PLAYER'}]},photo:true,text:''});assert(r.question);
console.log('PASS 2026-10-30: known agency with duplicate card rows, approved circled newcomers, proof guards, no duplicate manual attendance, spelling-correction preservation');
