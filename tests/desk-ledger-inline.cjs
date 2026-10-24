const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const cache={};function mod(file){if(cache[file])return cache[file];const exports={};cache[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>n.startsWith('./')?mod('lib/'+n.slice(2)+'.ts'):require(n),Date,JSON,Number,Set,Map,Array,Error});return exports;}
const {deskPlan}=mod('lib/desk-ledger-plan.ts'),{ledgerView}=mod('lib/desk-ledger-view.ts'),{serial}=mod('lib/accounting-plan.ts'),{settlementProfile}=mod('lib/settlement-profile.ts');
const day='2026-10-24',d=serial(day),row=(g,n,b=1)=>[g,d,'5-3','5M',n,'=CARD','=AGENCY',b,'=RAKE','=BACK','KEEP'];
const s={daily:[settlementProfile.dailyHeaders,row(6,'MANUAL'),[],row(8,'FIRST'),row('','MIDDLE'),[],row('','LAST',3),[],row(9,'NEXT')],master:[['Name'],...['FIRST','MIDDLE','LAST','NEW','NEXT'].map(n=>[n,'','KOREA'])],fnb:[],menu:[]};
const expected=i=>[...s.daily[i].slice(0,5),s.daily[i][7]];
function apply(p){const out=structuredClone(s.daily);for(const c of p.changes){const m=c.range.match(/!(A|E|H)(\d+)/);assert(m);const i=+m[2]-1;assert(i>=3&&i<=7);c.values[0].forEach((v,j)=>out[i][({A:0,E:4,H:7})[m[1]]+j]=v);}for(let i=0;i<out.length;i++)for(const c of [5,6,8,9,10])assert.equal(out[i][c],s.daily[i][c]);assert.deepEqual(out[1],s.daily[1]);assert.deepEqual(out[8],s.daily[8]);return out;}
let p=deskPlan({kind:'participant',row:5,expected:expected(4),player:'NEW',buyins:2,reason:'이름 정정'},s);let out=apply(p);assert.equal(out[4][4],'NEW');assert.equal(out[4][7],2);
for(const player of ['FIRST','UNKNOWN'])assert.throws(()=>deskPlan({kind:'participant',row:5,expected:expected(4),player,buyins:1,reason:'정정'},s));
assert.throws(()=>deskPlan({kind:'participant',row:5,expected:['old'],player:'NEW',buyins:1,reason:'정정'},s));
assert.throws(()=>deskPlan({kind:'participant',row:5,expected:expected(4),player:'NEW',buyins:1,reason:''},s));
out=apply(deskPlan({kind:'cancel',row:5,expected:expected(4),reason:'중복'},s));assert.equal(out[4][4],'LAST');assert.equal(out[4][7],3);assert.equal(out[5][4]||'','');
out=apply(deskPlan({kind:'cancel',row:4,expected:expected(3),reason:'중복'},s));assert.equal(out[3][0],8);assert.equal(out[3][4],'MIDDLE');
const manual=structuredClone(s);manual.daily[5]=['',d,'5-3','5M','','','',4];assert.throws(()=>deskPlan({kind:'cancel',row:5,expected:expected(4),reason:'중복'},manual));
const calculated=structuredClone(s.daily);for(const r of calculated.slice(1)){if(r[4]){r[8]=r[7]*500000;r[9]=r[7]*250000;}}
let v=ledgerView(s,day,calculated);assert.equal(v.daily.find(r=>r.player==='LAST').rake,1500000);assert.equal(v.daily.find(r=>r.player==='LAST').rakeback,750000);
calculated[3][9]=0;assert.equal(ledgerView(s,day,calculated).daily.find(r=>r.player==='FIRST').rakeback,0);
calculated[3][9]='#REF!';assert.equal(ledgerView(s,day,calculated).daily.find(r=>r.player==='FIRST').rakeback,null);
calculated[3][7]=4;assert.equal(ledgerView(s,day,calculated).daily.find(r=>r.player==='LAST').rake,null);
assert.equal(ledgerView(s,day).daily.find(r=>r.player==='FIRST').rake,null);
const duplicate=structuredClone(s);duplicate.daily[4][4]='FIRST';p=deskPlan({kind:'cancel',row:5,expected:[...duplicate.daily[4].slice(0,5),1],reason:'중복'},duplicate);assert(!p.changes.some(c=>c.range.includes('A4:')));
console.log('Ledger inline: scoped replacement, duplicate/stale guards, cancellation compaction, manual/formula preservation and verified sheet amounts passed');
