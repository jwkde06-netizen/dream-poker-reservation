
const assert=require('node:assert/strict');
const {completePhotoRoster,verifyChipEvidence}=require('../.test-build/accounting-vision');
const base={kind:'add',date:'2026-10-23',game:8,printedGame:9,table:13,blind:'5M',buyins:1,chips:100000};
const master=[['PLAYER','CARD','AGENCY'],['BAEK JAE HUI','','KOREA2'],['CHANG YOON HO','','KOREA2'],['OLIVER CHARLES','','UK'],['YE GUI CAI','1402','CHINA']];
const rules=[{content:'CHANG CALEB YOON-HO = CHANG YOON HO'},{content:'YE GUI CAI: 이 선수는 우리 정산 코드 대상이 아니므로 자동 정산 제외'}];
const paper={date:base.date,table:13,printedGame:9,handwrittenGame:8,headerCorrections:[{field:'game',value:8},{field:'table',value:12}],names:['BAEK JAE HUI','CHANG CALEB YOON-HO','OLIVER CHARLES','YE GUI CAI'],chipAmounts:[100000,100000,100000,100000],selected:[true,false,true,false],hasSelectionMarkers:true};
let r=completePhotoRoster([{...base,player:'BAEK JAE HUI'},{...base,player:'YE GUI CAI'}],{documents:[paper]},master,rules);
assert.deepEqual(r.operations.map(o=>o.player),['BAEK JAE HUI','CHANG YOON HO','OLIVER CHARLES']);
assert(r.operations.every(o=>o.table===12&&o.game===8&&o.buyins===1));
r=verifyChipEvidence(r.operations,{documents:[paper]},rules);
assert.equal(r.operations.length,3);assert.equal(r.questions.length,0);
// A Chinese agency is not a nationality-based exclusion.
const noExclusion=completePhotoRoster([{...base,table:12,player:'BAEK JAE HUI'}],{documents:[paper]},master,rules.slice(0,1));
assert(noExclusion.operations.some(o=>o.player==='YE GUI CAI'));
// Preserve count disagreement for independent verification, not silent correction.
const disagreement=completePhotoRoster([{...base,table:12,player:'BAEK JAE HUI',buyins:2}],{documents:[paper]},master,rules);
assert(!verifyChipEvidence(disagreement.operations,{documents:[paper]},rules).operations.some(o=>o.player==='BAEK JAE HUI'));
// Ambiguous duplicate papers may not bind a mismatched printed table.
assert.equal(completePhotoRoster([{...base,player:'BAEK JAE HUI'}],{documents:[paper,paper]},master,rules).operations.length,0);
console.log('PASS game8: uncircled known alias, new UK identity, explicit exclusion, corrected table, count conflict, ambiguous papers');

const struck=completePhotoRoster([{...base,table:12,player:'BAEK JAE HUI'}],{documents:[{...paper,crossedOut:[false,true,false,false]}]},master,rules);assert(!struck.operations.some(o=>o.player==='CHANG YOON HO'));
