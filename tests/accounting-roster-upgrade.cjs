
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
 // Regression: 2026-10-29 Table 4 / printed No.13 / ledger game 11.
 // The independent reader interpreted handwritten "5M" as game 54.
 const {bindPaperHeaders}=require('../.test-build/accounting-corrections');
 const liveOp={kind:'total',date:'2026-10-29',game:11,printedGame:13,table:4,blind:'5M',player:'KIM HYUNG WOOK',buyins:3,chips:300000};
 const livePaper={date:liveOp.date,table:4,printedGame:13,handwrittenGame:54,
  headerCorrections:[{field:'game',value:54,rawText:'5M'},{field:'level',value:3,rawText:'LV3'}],
  names:['KIM HYUNG WOOK'],chipAmounts:[300000],selected:[true],hasSelectionMarkers:true};
 const liveMaster=[['name','card','agency'],['KIM HYUNG WOOK','','KOREA']];
 for(const label of ['3M','5M','10M','15M','LV3','LV4']){
  const evidence={documents:[{...livePaper,headerCorrections:[{field:'game',value:54,rawText:label}]}]};
  const covered=completePhotoRoster([liveOp],evidence,liveMaster);
  assert.equal(covered.questions.length,0,label);
  assert.equal(covered.operations[0].game,11,label);
  assert.equal(verifyChipEvidence(covered.operations,evidence).operations[0].buyins,3,label);
 }
 assert.equal(bindPaperHeaders(livePaper).handwrittenGame,null);
 const actualGame={...livePaper,headerCorrections:[{field:'game',value:54,rawText:'54'}]};
 assert.equal(bindPaperHeaders(actualGame).handwrittenGame,54);
 assert.equal(completePhotoRoster([liveOp],{documents:[actualGame]},liveMaster).operations.length,0);
 assert.equal(bindPaperHeaders({...livePaper,headerCorrections:[{field:'game',value:54,rawText:'5'}]}).handwrittenGame,null);
 assert.equal(completePhotoRoster([liveOp],{documents:[livePaper,livePaper]},liveMaster).operations.length,0);
 const covered=completePhotoRoster([liveOp],{documents:[livePaper]},liveMaster);
 assert.equal(verifyChipEvidence(covered.operations,{documents:[{...livePaper,chipAmounts:[200000]}]}).operations.length,0);
 console.log('PASS handwritten stake/level labels, ledger vs printed number, real correction, ambiguity and chip-count guards');
