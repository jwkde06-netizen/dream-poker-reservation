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
assert.equal(empty,'소속을 확인해주세요.');assert(!empty.includes('완료'));
const cancelled=completionReply([{...op,kind:'cancel'}],null,false,{summary:['12-2 테이블 CHANG YOON HO 명단에서 빼고 같은 게임의 빈칸도 정리했어요.'],changes:[{}]});
assert.equal(cancelled,'✅ 8번 게임 선수 삭제 반영 완료');
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

const {bindConfirmedRebuy}=require('../.test-build/accounting-vision');
const rebuyOp={kind:'total',date:'2026-10-23',game:9,table:14,blind:'5M',player:'PARK SOO MIN',buyins:2,chips:200000};
const rebuyPaper={date:rebuyOp.date,printedGame:7,table:2,names:['PARK SOO MIN'],chipAmounts:[200000],selected:[true],hasSelectionMarkers:false};
const rebuyEvidence={documents:[rebuyPaper]};
const rebuyGames=[{date:rebuyOp.date,gameNumber:9,tableNumber:14,tableLabel:'14-1',players:[{name:'PARK SOO MIN',buyins:1}]}];
const rebuyQuestion='사진의 Table 2 명단은 기존 9번 게임(14-1)의 리바인 명단이 맞나요?';
const confirmedRebuy=bindConfirmedRebuy([rebuyOp],rebuyEvidence,'네',rebuyQuestion,rebuyGames);
assert.equal(confirmedRebuy[0].confirmedPaperTable,2);
assert.equal(confirmedRebuy[0].table,14);
assert.equal(confirmedRebuy[0].game,9);
assert.equal(verifyChipEvidence(confirmedRebuy,rebuyEvidence).operations.length,1);
assert.equal(verifyChipEvidence([rebuyOp],rebuyEvidence).operations.length,0);
for(const answer of ['아니요','확인해줘'])assert(!bindConfirmedRebuy([rebuyOp],rebuyEvidence,answer,rebuyQuestion,rebuyGames)[0].confirmedPaperTable);
assert(!bindConfirmedRebuy([rebuyOp],rebuyEvidence,'네','다른 질문',rebuyGames)[0].confirmedPaperTable);
assert(!bindConfirmedRebuy([rebuyOp],rebuyEvidence,'네',rebuyQuestion,[...rebuyGames,...rebuyGames])[0].confirmedPaperTable);
assert.equal(verifyChipEvidence(confirmedRebuy,{documents:[{...rebuyPaper,chipAmounts:[300000]}]}).operations.length,0);
console.log('Confirmed rebuy binds paper 7/table2 to ledger game9/table14 without bypassing chip checks');

assert.equal(completionReply([{...op,game:2}],null,false,{summary:[],changes:[{}]}),'✅ 2번 게임 바이인 반영 완료');
assert.equal(completionReply([{...op,game:2,kind:'total'}],null,false,{summary:[],changes:[{}]}),'✅ 2번 게임 리바인 반영 완료');
assert.equal(completionReply([{...op,game:2}],null,false,{summary:[],changes:[{}],rebuyGames:[2]}),'✅ 2번 게임 리바인 반영 완료');
assert.equal(completionReply([{...op,game:2,kind:'total'}],null,false,{summary:[],changes:[]}),'✅ 2번 게임 리바인 이미 반영됨');
assert.equal(completionReply([{...op,game:2},{...op,game:2,kind:'total',player:'OLIVER'}],null,false,{summary:[],changes:[{}]}),'✅ 2번 게임 리바인 반영 완료');
assert.equal(completionReply([{...op,game:2},{...op,game:3,kind:'total'}],null,false,{summary:[],changes:[{}]}),'✅ 2번 게임 바이인 반영 완료\n✅ 3번 게임 리바인 반영 완료');
