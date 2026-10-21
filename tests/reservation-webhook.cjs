const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const env={ACCOUNTING_ENABLED:'true'},calls=[];let authenticated=true,fail=false;
const mod={exports:{}},code=ts.transpileModule(fs.readFileSync('app/api/accounting/webhook/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env},require:name=>{
 if(name==='next/server')return{NextResponse:{json:(body,init)=>Response.json(body,init)}};
 if(name.endsWith('/accounting-agent'))return{authorized:()=>authenticated,handle:async u=>calls.push(['accounting',u])};
 if(name.endsWith('/reservation-local-actions'))return{handleReservationCallback:async u=>{calls.push(['reservation',u]);if(fail)throw Error('retry');return Boolean(u.callback_query?.data?.startsWith('lr:'));}};
 throw Error(name);
}});
const request=body=>new Request('https://test.invalid/api/accounting/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 const button={callback_query:{data:'lr:confirm:test'}};
 authenticated=false;assert.equal((await mod.exports.POST(request(button))).status,401);assert.equal(calls.length,0);authenticated=true;
 assert.equal((await mod.exports.POST(request(button))).status,200);assert.equal(calls.filter(c=>c[0]==='accounting').length,0);
 const ledger={message:{text:'ledger input'}};assert.equal((await mod.exports.POST(request(ledger))).status,200);assert.deepEqual(calls.at(-1),['accounting',ledger]);
 env.ACCOUNTING_ENABLED='false';assert.equal((await mod.exports.POST(request(button))).status,200);assert.equal((await mod.exports.POST(request(ledger))).status,503);
 fail=true;assert.equal((await mod.exports.POST(request(button))).status,503);
 console.log('Webhook checks passed: shared secret, reservation callbacks, accounting routing and retry failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
