const assert=require('node:assert/strict');
const {planOperations,serial}=require('../.test-build/accounting-plan.js');
const day=serial('2026-10-23');
const row=(g,n,b=1)=>[g,day,'12-2','5M',n,'FORMULA','FORMULA',b];
const source=[['header'],row(6,'MANUAL'),[],row(8,'FIRST'),row('','OH SEONG JUN'),[],row('','LAST',3),[],row(9,'NEXT')];
const master=[['name'],...['FIRST','OH SEONG JUN','LAST'].map(n=>[n,'','KOREA'])];
const op=n=>({kind:'cancel',player:n,date:'2026-10-23',game:8,table:12,blind:'5M'});
function apply(ops){const p=planOperations(ops,source,[],master),out=structuredClone(source);for(const c of p.changes){const m=c.range.match(/!(A|H)(\d+)/),i=Number(m[2])-1;assert(i>=3&&i<=7);out[i]??=[];c.values[0].forEach((v,j)=>out[i][(m[1]==='H'?7:0)+j]=v);}assert.deepEqual(out[1],source[1]);assert.deepEqual(out[8],source[8]);return out;}
let out=apply([op('OH SEONG JUN')]);assert.equal(out[4][4],'LAST');assert.equal(out[4][7],3);assert.equal(out[4][5],'FORMULA');assert.equal(out[5][4]||'','');
out=apply([op('FIRST')]);assert.equal(out[3][0],8);assert.equal(out[3][4],'OH SEONG JUN');
out=apply([op('FIRST'),op('OH SEONG JUN'),op('LAST')]);assert(out.slice(3,8).every(r=>!r[4]));
out=apply([op('LAST')]);assert.equal(out[4][4],'OH SEONG JUN');
assert.deepEqual(source[4],row('','OH SEONG JUN'));
console.log('Cancellation compaction: middle/first/last/multiple, buyins, formulas and other games passed');
