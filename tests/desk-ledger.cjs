const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function mod(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>n==='./accounting-plan'?mod('lib/accounting-plan.ts'):require(n),Date,JSON,Number,Set,Map,Array,Error});return exports;}
const {deskPlan,sourceHash}=mod('lib/desk-ledger-plan.ts');const {serial}=mod('lib/accounting-plan.ts');const day=serial('2026-10-21');
const s={daily:[['번호'],[7,day,'13-2','5M','LEE KWANG TAE','','KOREA',1],['',day,'13-2','5M','KIM SEON HAK','','KOREA',1]],master:[['이름'],['LEE KWANG TAE','','KOREA'],['KIM SEON HAK','','KOREA']],fnb:[['날짜'],[day,'2F',60000,'아메리카노']],menu:[]};
const expected=[...s.daily[1].slice(0,5),1];
let p=deskPlan({kind:'buyins',row:2,expected,buyins:2},s);assert.equal(p.changes.length,1);assert.equal(p.changes[0].range,"'일일 입력'!H2");
assert.throws(()=>deskPlan({kind:'buyins',row:2,expected:['stale'],buyins:2},s));
const more=JSON.parse(JSON.stringify(s));more.daily[1][7]=3;assert.equal(deskPlan({kind:'buyins',row:2,expected:[...expected.slice(0,5),3],buyins:2},more).changes[0].values[0][0],2);
p=deskPlan({kind:'cancel',row:2,expected,reason:'다음 게임 참가'},s);assert.equal(p.changes[0].range,"'일일 입력'!A2:E2");assert.equal(p.changes[0].values[0][0],7);assert.equal(p.changes[0].values[0][4],'KIM SEON HAK');assert(!p.changes.some(c=>/[FGI-O]\d/.test(c.range)));
p=deskPlan({kind:'game',date:'2026-10-21',game:7,table:13,blind:'5M',players:[{player:'LEE KWANG TAE',buyins:1}]},s);assert.equal(p.changes.length,0);
assert.throws(()=>deskPlan({kind:'game',date:'2026-10-21',game:7,table:13,blind:'5M',players:[{player:'UNKNOWN',buyins:1}]},s));
p=deskPlan({kind:'fnb_edit',date:'2026-10-21',floor:'2F',amount:120000,note:'아메리카노 2잔',row:2,expected:s.fnb[1]},s);assert.equal(p.changes[0].values[0][2],120000);
assert.throws(()=>deskPlan({kind:'fnb',date:'2026-10-21',floor:'5F',amount:60000,note:'아메'},s));
const derived=JSON.parse(JSON.stringify(s));derived.daily[1][8]=500000;assert.equal(sourceHash(s),sourceHash(derived));derived.daily[1][7]=2;assert.notEqual(sourceHash(s),sourceHash(derived));
console.log('Desk planner: stale rows, direct decrease, scoped cancellation, formula preservation, duplicate game, unknown player, F&B and source hash passed');
