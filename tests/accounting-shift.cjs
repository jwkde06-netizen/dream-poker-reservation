const assert=require('node:assert/strict');
const {planOperations,serial}=require('../.test-build/accounting-plan');
const {correctedOperations}=require('../.test-build/accounting-context');
const {changedDaily,attendance}=require('../.test-build/accounting-reconcile');
const {resolveFnb}=require('../.test-build/accounting-intake');
const date='2026-10-22',day=serial(date);
const master=[['PLAYER'],['LEE KWANG TAE','','KOREA'],['KIM SEON HAK','','KOREA'],['CORDINGLEY OLIVER JAMES','','UK']];
const row=(game,player,count=1,table='13-2')=>[game,day,table,'5M',player,'','',count];
const daily=[['NUMBER'],row(7,master[1][0]),row('',master[2][0]),row('',master[3][0]),[],row(8,master[1][0],1,'13-3')];
const op=(player,game=7,count=1)=>({kind:'add',date,game,table:13,blind:'5M',player,buyins:count});
// A confirmed game cannot silently fall back to a different game with that player.
const explicit=correctedOperations([op(master[2][0],9,2)],'9번 게임 리바인',master);
assert.equal(explicit[0].gameConfirmed,true);
assert.throws(()=>planOperations(explicit,daily,[],master,{rebuySnapshot:true}),/게임 번호/);
// One known print-number mismatch still resolves to a uniquely existing session.
assert.equal(planOperations([op(master[2][0],9,2)],daily,[],master,{rebuySnapshot:true}).changes[0].range,"'일일 입력'!H3");
// Two requested games on the same physical table stay separate.
let p=planOperations(correctedOperations([op(master[2][0],7,2),op(master[1][0],8,3)],'7,8번 게임 리바인',master),daily,[],master,{rebuySnapshot:true});
assert.deepEqual(p.changes.map(c=>[c.range,c.values[0][0]]),[["'일일 입력'!H3",2],["'일일 입력'!H6",3]]);
// Unknown or code-less newcomers don't block the other, verified players.
p=planOperations([op('NEW PERSON',9),op(master[2][0],9)],daily,[],master,{partialAttendance:true,tableRoundLabels:true});
assert.equal(p.review.length,1);assert.equal(p.changes.length,2);assert.equal(p.changes[0].values[0][4],master[2][0]);
const blank=[...master,['NEW PERSON','','']];
p=planOperations([op('NEW PERSON',9),op(master[2][0],9)],daily,[],blank,{partialAttendance:true});
assert.match(p.review[0],/소속 코드/);assert.equal(p.changes.length,2);
// Consecutive heading-player cancellations must produce no overlapping writes.
p=planOperations([{...op(master[1][0]),kind:'cancel'},{...op(master[2][0]),kind:'cancel'}],daily,[],master);
const seen=new Set();for(const c of p.changes){const m=c.range.match(/!([A-H])(\d+)/);for(let j=0;j<c.values[0].length;j++){const key=m[2]+':'+(m[1].charCodeAt(0)+j);assert(!seen.has(key));seen.add(key);}}
let after=changedDaily(daily,p.changes);
assert.equal(after[3][0],7);assert.equal(after[3][4],master[3][0]);assert.equal(after[5][0],8);
assert.deepEqual(attendance(after,date).map(e=>[e.game,e.player]),[[7,master[3][0]],[8,master[1][0]]]);
assert(!p.changes.some(c=>/![FGI-O]\d/.test(c.range)));
// Replaying a cumulative photo does not increment again or lower a manual total.
p=planOperations([op(master[1][0],8,3)],after,[],master,{photoSnapshot:true});after=changedDaily(after,p.changes);
assert.equal(planOperations([op(master[1][0],8,3)],after,[],master,{photoSnapshot:true}).changes.length,0);
assert.equal(planOperations([{...op(master[1][0],8,1),kind:'total'}],after,[],master,{photoSnapshot:true}).changes.length,0);
const menu=[['메뉴','별칭','단가','단위'],['아메리카노','Cà phê đen|아아',60000,'잔']];
const fnb={kind:'fnb',date,floor:'5F',recipient:'준기형님',amount:null,items:[{menu:'Ca phe den - Large',quantity:2}]};
let bill=resolveFnb([fnb],menu)[0];assert.equal(bill.amount,120000);assert.equal(bill.floor,'2F');assert.equal(bill.note,'준기형님 아메리카노 2잔');
bill=resolveFnb([{...fnb,floor:'3F',amount:100000,note:'Vietnamese'}],menu)[0];assert.equal(bill.amount,100000);assert.equal(bill.floor,'3F');assert.equal(bill.note,'준기형님 아메리카노 2잔');
assert.equal(resolveFnb([{...fnb,items:[{menu:'Ca phe dua',quantity:2}]}],menu)[0].amount,null);
assert.deepEqual(resolveFnb(undefined,menu),[]);
console.log('Shift readiness: game identity, partial attendance, cancellation, replay and Vietnamese F&B checks passed');
// Existing players must never be blocked by an OCR-generated registration.
const known=[['PLAYER'],['KIM SOO MIN','','KOREA2']];
const photoOps=[{kind:'register',player:'KIM SOOMIN',agency:'KOREA'},op('KIM SOOMIN',3)];
let cleaned=correctedOperations(photoOps,'',known);
assert.equal(cleaned.length,1);assert.equal(cleaned[0].kind,'add');assert.equal(cleaned[0].player,'KIM SOO MIN');
const existingPlan=planOperations(cleaned,[['NUMBER'],[]],[],known,{partialAttendance:true});
assert.equal(existingPlan.review.length,0);assert.ok(existingPlan.changes.some(c=>c.range.includes('일일 입력')));
assert.ok(!existingPlan.changes.some(c=>c.range.includes('플레이어 명단')));
assert.equal(correctedOperations([{kind:'register',player:'KIM SOO MIN',agency:'KOREA2'}],'',known).length,0);
assert.equal(correctedOperations(photoOps,'KIM SOO MIN KOREA 변경',known).length,2);
assert.equal(correctedOperations(photoOps,'',[['PLAYER'],['KIM SOO MIN','','']]).length,2);
assert.equal(correctedOperations(photoOps,'',[['PLAYER']]).length,2);
