const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const env={ACCOUNTING_ENABLED:'true',STAFF_TELEGRAM_CHAT_ID:'-10011'},calls=[];let authenticated=true,fail=false;
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const filter={exports:{}};vm.runInNewContext(compile('lib/accounting-staff-notice.ts'),{module:filter,exports:filter.exports});
const mod={exports:{}},code=compile('app/api/accounting/webhook/route.ts');
vm.runInNewContext(code,{module:mod,exports:mod.exports,process:{env},require:name=>{
 if(name==='next/server')return{NextResponse:{json:(body,init)=>Response.json(body,init)}};
 if(name.endsWith('/accounting-staff-notice'))return filter.exports;
 if(name.endsWith('/accounting-management-room'))return{handleManagementRoom:async u=>{calls.push(['management',u]);return u.message?.chat?.id===-200;}};
 if(name.endsWith('/accounting-report'))return{handleReportRoom:async()=>false};
 if(name.endsWith('/reservation-telegram-actions'))return{handlePublicReservationCallback:async u=>{calls.push(['public-reservation',u]);return Boolean(u.callback_query?.data?.startsWith('rr:'));}};
 if(name.endsWith('/accounting-agent'))return{authorized:()=>authenticated,handle:async u=>calls.push(['accounting',u])};
 if(name.endsWith('/reservation-local-actions'))return{handleReservationCallback:async u=>{calls.push(['reservation',u]);if(fail)throw Error('retry');return Boolean(u.callback_query?.data?.startsWith('lr:'));}};
 throw Error(name);
}});
const request=body=>new Request('https://test.invalid/api/accounting/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
(async()=>{
 const button={callback_query:{data:'lr:confirm:test'}};
 authenticated=false;assert.equal((await mod.exports.POST(request(button))).status,401);assert.equal(calls.length,0);authenticated=true;
 assert.equal((await mod.exports.POST(request(button))).status,200);assert.equal(calls.filter(c=>c[0]==='accounting').length,0);
 const publicButton={callback_query:{data:'rr:confirm:test'}};assert.equal((await mod.exports.POST(request(publicButton))).status,200);assert.equal(calls.filter(c=>c[0]==='accounting').length,0);
 const ledger={message:{text:'ledger input'}};assert.equal((await mod.exports.POST(request(ledger))).status,200);assert.deepEqual(calls.at(-1),['accounting',ledger]);
 const managed={message:{chat:{id:-200},text:'관리실 연결'}};const before=calls.filter(c=>c[0]==='accounting').length;
 assert.equal((await mod.exports.POST(request(managed))).status,200);assert.equal(calls.filter(c=>c[0]==='accounting').length,before);
 const chat={id:-10011,type:'supergroup'},note={message:{chat,text:'오후 1시 출근자 오픈 체크리스트\n1·2·3번째 게임 한국인 선수 예약 확인'}};
 for(const u of [note,{edited_message:note.message},{message:{chat,text:'굿굿'}}]){
  const offset=calls.length;assert.equal((await mod.exports.POST(request(u))).status,200);
  assert(!calls.slice(offset).some(([handler])=>['management','accounting'].includes(handler)));
 }
 const receipt={message:{chat,photo:[{file_id:'test-only'}]}};assert.equal((await mod.exports.POST(request(receipt))).status,200);assert.deepEqual(calls.at(-1),['accounting',receipt]);
 env.ACCOUNTING_ENABLED='false';assert.equal((await mod.exports.POST(request(button))).status,200);assert.equal((await mod.exports.POST(request(ledger))).status,503);
 fail=true;assert.equal((await mod.exports.POST(request(button))).status,503);
 console.log('Webhook checks passed: shared secret, reservation callbacks, staff notice silence, receipt routing and retry failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
