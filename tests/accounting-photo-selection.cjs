const assert=require('node:assert/strict');
const {completePhotoRoster,verifyChipEvidence,photoPlayerUncircledIncluded}=require('../.test-build/accounting-vision');
const {reconcileOperation}=require('../.test-build/accounting-reconcile');
const op={date:'2026-10-30',game:4,table:12,printedGame:4,blind:'5M',kind:'total',buyins:1,chips:100000};
const names=['HWANG JEONGEUI','LEE SANGHYEON','JEONG ISEUL','WEI ZHENGMOU'];
const master=[['PLAYER','CARD','AGENCY'],...names.map(n=>[n,'',n==='WEI ZHENGMOU'?'CHINA':'KOREA'])];
const paper={date:op.date,table:12,printedGame:4,handwrittenGame:null,names,chipAmounts:[100000,100000,100000,100000],selected:[true,true,true,false],crossedOut:[false,false,false,false],hasSelectionMarkers:true};
const state={version:1,date:op.date,entries:[],aliases:[],overrides:[{kind:'removed',entry:{date:op.date,game:4,tableLabel:'12-1',blind:'5M',player:'WEI ZHENGMOU',buyins:1},reason:'sheet_edit',observedAt:'2026-10-30T08:18:58Z'}]};
for(const input of [names.slice(0,3),names]){
 const coverage=completePhotoRoster(input.map(player=>({...op,player})),{documents:[paper]},master);
 assert.deepEqual(coverage.operations.map(o=>o.player),names.slice(0,3));
 assert.deepEqual(coverage.questions,[]);
 const verified=verifyChipEvidence(coverage.operations,{documents:[paper]});
 assert.equal(verified.operations.length,3);
 const reviews=verified.operations.map(o=>reconcileOperation(o,{state,photo:true,text:''})).filter(x=>x.question);
 assert.equal(reviews.length,0,'uncircled WEI never reaches rejoin reconciliation');
}
assert.equal(verifyChipEvidence([{...op,player:'WEI ZHENGMOU',masterVerified:true}],{documents:[paper]}).operations.length,0,'masterVerified cannot bypass independent selection');
assert.equal(completePhotoRoster([{...op,player:names[0]}],{...paper,hasSelectionMarkers:false},master).operations.length,4,'unmarked rosters still use known eligibility');
const exception=[{content:'WEI ZHENGMOU는 동그라미가 없어도 포함한다.'}];
assert.equal(completePhotoRoster([{...op,player:names[0]}],paper,master,exception).operations.length,4,'only explicit named inclusion may override selection');
assert.equal(verifyChipEvidence([{...op,player:'WEI ZHENGMOU'}],paper,exception).operations.length,1);
assert(!photoPlayerUncircledIncluded('WEI ZHENGMOU',[{content:'WEI ZHENGMOU는 동그라미가 없어도 포함하지 않는다.'}]));
const priorRule=[{content:'CHANG CALEB YOON-HO는 CHANG YOON HO와 동일인이다. JANG YOON HO와는 다르다. 이 선수는 종이 명단에 칩 수가 확인되면 동그라미가 없어도 포함한다.'}];
assert(photoPlayerUncircledIncluded('CHANG YOON HO',priorRule));
assert(!photoPlayerUncircledIncluded('JANG YOON HO',priorRule),'an unrelated name mentioned in the rule is not an inclusion target');
const excluded=[...exception,{content:'WEI ZHENGMOU: 이 선수는 우리 정산 코드 대상이 아니므로 자동 정산 제외'}];
assert(!completePhotoRoster([{...op,player:names[0]}],paper,master,excluded).operations.some(o=>o.player==='WEI ZHENGMOU'));
console.log('PASS selection: exact WEI regression, no master-code expansion, no forged bypass, named exception scope and exclusion precedence');
