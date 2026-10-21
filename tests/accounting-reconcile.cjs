const assert=require('node:assert/strict');
const {reconcileSheet,reconcileOperation,afterVerifiedWrite,attendance,changedDaily}=require('../.test-build/accounting-reconcile');
const {planOperations}=require('../.test-build/accounting-plan');
const {correctedOperations}=require('../.test-build/accounting-context');
const date='2026-10-21',day=46316,now='2026-10-21T12:05:00Z';
const row=(g,t,n,b=1)=>[g,day,t,'5M',n,'','KOREA',b];
const before=[['NUMBER'],row(10,'5-3','YANG JUNMO'),[],row(12,'13-3','CHANG YOON HO'),row('','13-3','LEE KWANG TAE'),row('','13-3','KIM SEON HAK'),row('','13-3','LEE HAE WON'),row('','13-3','YUN SANG WOO')];
const manual=[['NUMBER'],row(10,'5-3','YANG JUNMO'),row('','5-3','LEE KWANG TAE'),row('','5-3','GWON SANG YONG'),[],row(11,'13-3','CHANG YOON HO'),row('','13-3','LEE HAE WON'),row('','13-3','YUN SANG WOO')];
const master=[['PLAYER'],...Array.from(new Set([...before,...manual].map(r=>r[4]).filter(Boolean))).map(n=>[n,'','KOREA'])];
const op=(player,game=11,table=13,buyins=1)=>({kind:'add',date,game,table,blind:'5M',player,buyins});
const baseline=reconcileSheet(before,date,[],now);
const legacy={message_id:90,status:'applied',plan:{operations:[op('LEE KWANG TAE',12)],changes:[{range:"'일일 입력'!A4:E4",values:[before[3].slice(0,5)]},{range:"'일일 입력'!H4",values:[[1]]},{range:"'일일 입력'!A5:E5",values:[before[4].slice(0,5)]},{range:"'일일 입력'!H5",values:[[1]]}]}};
const state=reconcileSheet(manual,date,[{plan:{sheetState:baseline}},legacy],now);
assert.deepEqual(state.overrides.filter(x=>x.kind==='removed').map(x=>[x.entry.player,x.entry.game]),[['LEE KWANG TAE',11],['KIM SEON HAK',11]]);
assert.equal(state.aliases[0].fromGame,12);
assert(state.aliases[0].sourceMessageIds.includes(90));
const options={state,photo:true,sourceMessageId:90,sourceTime:Date.parse('2026-10-21T11:46:00Z')/1000,text:''};
let r=reconcileOperation(op('LEE KWANG TAE',12),options);
assert.equal(r.op.game,11);assert.equal(r.skip,true);assert.match(r.question,/11번 게임/);
r=reconcileOperation(op('CHANG YOON HO',12),options);assert.equal(r.op.game,11);assert(!r.skip);
// Danny's current game-10 entry is preserved and never duplicated; cancellation
// in game 11 is not a global ban on this player.
r=reconcileOperation(op('LEE KWANG TAE',10,5),options);assert(!r.skip);
let p=planOperations([op('LEE KWANG TAE',10,5)],manual,[],master,{reconcile:o=>reconcileOperation(o,options),tableRoundLabels:true,photoSnapshot:true});
assert.equal(p.changes.length,0);assert.equal(p.review.length,0);
// A new game with similar players is not misidentified as an old session.
r=reconcileOperation(op('LEE KWANG TAE',12,13),{...options,sourceMessageId:100});assert.equal(r.op.game,12);assert(!r.skip);
r=reconcileOperation(op('LEE KWANG TAE',11,13),{...options,text:'11번 게임 LEE KWANG TAE 다시 참가했어'});assert(!r.skip);assert.equal(r.op.kind,'add');
r=reconcileOperation(op('LEE KWANG TAE',11,13),{...options,text:'LEE KWANG TAE 10번 게임 다시 참가했어'});assert(r.skip);
r=reconcileOperation(op('LEE KWANG TAE'),{...options,text:'11번 게임 LEE KWANG TAE 다시 참가하지 마'});assert(r.skip);
r=reconcileOperation(op('LEE KWANG TAE'),{...options,text:'네',pendingQuestion:'11번 게임에서 빠진 LEE KWANG TAE님, 다시 참가한 게 맞나요?'});assert(!r.skip);
// Only affected operations are withheld; definite rebuy amounts still apply.
p=planOperations([op('LEE KWANG TAE',12),op('CHANG YOON HO',12,13,2)],manual,[],master,{reconcile:o=>reconcileOperation(o,options),photoSnapshot:true});
assert.equal(p.review.length,1);assert.equal(p.changes.length,1);assert.equal(p.changes[0].values[0][0],2);
// Removal survives the next unrelated message and a changed row position.
const persisted=reconcileSheet(manual,date,[{plan:{sheetState:state}}],'2026-10-21T12:06:00Z');
assert(reconcileOperation(op('LEE KWANG TAE'),{...options,state:persisted}).skip);
const restored=[...manual,row('','13-3','LEE KWANG TAE')];
const restoredState=reconcileSheet(restored,date,[{plan:{sheetState:state}}],now);
assert(!reconcileOperation(op('LEE KWANG TAE'),{...options,state:restoredState}).skip);
const shifted=[manual[0],[],...manual.slice(1)];
assert.equal(reconcileSheet(shifted,date,[{plan:{sheetState:state}}],now).overrides.length,state.overrides.length);
// Bootstrap pre-upgrade jobs by recorded business writes, never by row numbers
// from the live sheet after Danny inserted two players.
const upgraded=reconcileSheet(manual,date,[legacy],now);
assert(upgraded.overrides.some(x=>x.entry.player==='LEE KWANG TAE'&&x.entry.game===11));
assert(upgraded.aliases.some(x=>x.fromGame===12));
// Corrected manual counts beat old image evidence. A later rebuy photograph can
// increase the total; older counts are already rejected by the planner.
const countBefore=[['NUMBER'],row(10,'5-3','LEE KWANG TAE',4)];
const countNow=[['NUMBER'],row(10,'5-3','LEE KWANG TAE',2)];
const counts=reconcileSheet(countNow,date,[{plan:{sheetState:reconcileSheet(countBefore,date,[])}}],now);
assert(reconcileOperation(op('LEE KWANG TAE',10,5,4),{...options,state:counts}).skip);
assert(!reconcileOperation(op('LEE KWANG TAE',10,5,3),{...options,state:counts,sourceTime:Date.parse(now)/1000+60}).skip);
// Bot cancellation is also a session-scoped tombstone, not just a blank row.
p=planOperations([{...op('LEE KWANG TAE',10,5),kind:'cancel'}],manual,[],master);
const after=afterVerifiedWrite(state,manual,p.changes,now);
assert(after.overrides.some(x=>x.entry.player==='LEE KWANG TAE'&&x.entry.game===10&&x.reason==='staff_cancel'));
assert.equal(attendance(changedDaily(manual,p.changes),date).filter(x=>x.game===10).length,2);
// Multi-game instructions cannot have every operation rewritten to the first
// game number by the literal-caption correction.
const move=correctedOperations([{...op('LEE KWANG TAE',11),kind:'cancel'},op('LEE KWANG TAE',10,5)],'11번게임 잘못 입력한 LEE KWANG TAE 빼고 10번게임에 추가',master);
assert.deepEqual(move.map(x=>x.game),[11,10]);
assert(!p.changes.some(c=>/![FGI-O]\d/.test(c.range)));
console.log('Manual attendance reconciliation: 31 assertions passed');
