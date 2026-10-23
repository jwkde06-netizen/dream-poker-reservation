const assert=require('node:assert/strict');
const {completePhotoRoster,verifyChipEvidence}=require('../.test-build/accounting-vision');
const {completionReply}=require('../.test-build/accounting-conversation');
const {correctionBlocked}=require('../.test-build/accounting-corrections');
const op={kind:'add',date:'2026-10-23',game:8,printedGame:9,table:12,blind:'5M',player:'CHANG YOON HO',buyins:1,chips:100000};
const rules=[{content:'CHANG CALEB YOON-HO = CHANG YOON HO'}];
const master=[['name','card','agency'],['CHANG YOON HO','','KOREA2'],['OLIVER CHARLES','','UK'],['YE GUI CAI','1402','CHINA']];
const paper={date:op.date,printedGame:9,handwrittenGame:8,table:12,names:['CHANG YOON HO','OLIVER CHARLES'],chipAmounts:[100000,100000],selected:[false,true],hasSelectionMarkers:true};
for(const mutation of [{selected:[]},{selected:['false',true]},{chipAmounts:[100000]},{crossedOut:[false]},{crossedOut:[false,'false']},{hasSelectionMarkers:null}]){
 const result=completePhotoRoster([op],{...paper,...mutation},master,rules);
 assert.equal(result.operations.length,0,'malformed independent evidence must not retain first-read attendance');assert(result.questions.length);
 assert(!result.questions.join().includes('다시 올려'));
 assert(correctionBlocked([{...op,kind:'cancel'},op],result.operations,result.questions[0]));
}
let result=completePhotoRoster([op],{...paper,names:['CHANG CALEB YOON-HO','CHANG YOON HO','OLIVER CHARLES'],chipAmounts:[100000,200000,100000],selected:[true,true,true]},master,rules);
assert.deepEqual(result.operations.map(o=>o.player),['OLIVER CHARLES']);assert.match(result.questions[0],/중복/);
for(const field of ['game','table']){
 result=completePhotoRoster([op],{documents:[{...paper,headerCorrections:[{field,value:8},{field,value:9}]}]},master,rules);
 assert.equal(result.operations.length,0);assert(result.questions.length);
}
result=completePhotoRoster([op],paper,master,rules);
assert.equal(verifyChipEvidence(result.operations,paper,rules).operations.length,2,'known uncircled player still eligible');
const unchanged=completionReply([op],null,false,{summary:['CHANG YOON HO은 이미 시트에 있어요.'],changes:[]});
assert.match(unchanged,/이미/);assert(!unchanged.includes('기록 완료'));
const empty=completionReply([op],'소속을 확인해주세요.',false,{summary:[],changes:[]});
assert.match(empty,/새로 반영한 항목은 없어요/);assert(!empty.includes('기록했어요'));
const cancelled=completionReply([{...op,kind:'cancel'}],null,false,{summary:['12-2 테이블 CHANG YOON HO 명단에서 빼고 같은 게임의 빈칸도 정리했어요.'],changes:[{}]});
assert.match(cancelled,/빈칸/);assert(!cancelled.includes('바이인 기록 완료'));
assert.match(completionReply([{...op,kind:'cancel'}],null,false),/선수 삭제 완료/);
console.log('Upgrade guards passed: malformed evidence, duplicates, ambiguous handwriting, uncircled known players, truthful completion');
// A short answer must retain new-entry semantics, not seek a nonexistent row.
const {continueChipConfirmation}=require('../.test-build/accounting-vision');
const {planOperations}=require('../.test-build/accounting-plan');
const uncertain=completePhotoRoster([op],{...paper,chipAmounts:[null,100000]},master,rules);
assert.deepEqual(uncertain.operations.map(o=>o.player),['OLIVER CHARLES']);
assert.deepEqual(uncertain.withheldOperations.map(o=>o.player),['CHANG YOON HO']);
const resumed=continueChipConfirmation('2바인',{plan:{unverifiedOperations:uncertain.withheldOperations,pendingQuestion:uncertain.questions[0]}});
assert.equal(resumed.operations[0].kind,'add');assert.equal(resumed.operations[0].buyins,2);
assert(planOperations(resumed.operations,[['header']],[],master).changes.length>0);
assert(!resumed.operations.some(o=>o.player==='OLIVER CHARLES'));
