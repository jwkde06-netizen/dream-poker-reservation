const assert=require('node:assert/strict');
const {compareCashier,discrepancyText}=require('../.test-build/cashier-reconciliation');
const e=(player,buyins=1,amount=500000,game=7)=>({player,buyins,amount,game});
const statement=entries=>({date:'2026-10-21',currency:'VND',complete:true,entries,totalBuyins:entries.reduce((n,e)=>n+e.buyins,0),totalAmount:entries.reduce((n,e)=>n+e.amount,0)});
const compare=(s,rows,opts)=>compareCashier(s,rows,'2026-10-21',opts);
assert.equal(compare(statement([e('KIM YOUNGIL')]),[e('KIM YOUNG IL')]).matched,true);
assert.equal(compare(statement([e('CHANG CALEB YOON-HO')]),[e('CHANG YOON HO')],{aliases:{CHANGCALEBYOONHO:'CHANG YOON HO'}}).matched,true);
const swapped=compare(statement([e('A',2,1000000),e('B')]),[e('A'),e('B',2,1000000)]);
assert.equal(swapped.matched,false);assert.equal(swapped.differences.length,2); // equal grand totals cannot conceal player differences
assert.equal(compare(statement([e('A')]),[e('B')]).differences.length,2);
assert.equal(compare(statement([e('A'),e('A')]),[e('A')]).matched,false);
assert.equal(compare({...statement([e('A')]),complete:false},[e('A')]).matched,false);
assert.equal(compare({...statement([e('A')]),totalAmount:900000},[e('A')]).matched,false);
assert.equal(compare({...statement([e('A')]),date:'2026-10-22'},[e('A')]).matched,false);
assert.equal(compare(statement([e('A',1,500000,8)]),[e('A')],{gameMappings:[{date:'2026-10-21',printedGame:8,game:7}],requireGameMapping:true}).matched,true);
assert.equal(compare(statement([e('A')]),[e('A')],{requireGameMapping:true}).matched,false);
assert.match(discrepancyText(swapped),/500,000동 적음/);
assert.match(discrepancyText(swapped),/500,000동 많음/);
console.log('cashier comparison: 12 assertions passed');
