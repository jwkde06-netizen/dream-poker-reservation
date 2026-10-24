const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,requireFn,extra={}){const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:requireFn,Date,JSON,Number,String,Error,Array,Math,AbortSignal,...extra});return mod.exports;}
const calls=[];let mismatch=false,ledgerMissing=false;
const row={id:'test',created_at:'2026-10-24T05:00:00Z',player_name:'TEST ALPHA',party_size:1,arrival_at:'2026-10-24T12:00:00Z',status:'confirmed',request_kind:'none',source:'desk',guest_note:'=IMPORTXML("https://invalid")',staff_reply:'',updated_actor:'TEST',updated_at:'2026-10-24T05:00:00Z',game_title:'5M',game_no:'4',table_no:'5',starts_at:'2026-10-24T12:00:00Z',is_default_queue:false};
let values;
const sheet=load('lib/reservation-sheet.ts',()=>({accessToken:async()=>'TEST',accountingWorkbook:'TEST_BOOK'}),{fetch:async(url,init)=>{
 calls.push({url,init});let body;
 if(url.includes('?fields='))body={sheets:[{properties:{title:'일일 입력',gridProperties:{rowCount:10}}}]};
 else if(url.includes('valueInputOption=RAW')){values=JSON.parse(init.body).values;body={};}
 else if(decodeURIComponent(url).includes("'일일 입력'!"))body={values:[['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN'],...(ledgerMissing?[]:[[4,'2026-10-24',5,'5M','TEST ALPHA','','',2]])]};
 else if(decodeURIComponent(url).includes('A1:R1'))body={values:[sheet.reservationHeaders]};
 else body={values:mismatch?[]:values};
 return {ok:true,json:async()=>body};
}});
const agent=load('lib/reservation-agent.ts',()=>{});
(async()=>{
 const ledger=[[4,'2026-10-24',5,'5M','TEST ALPHA','','',2]];
 assert.match(sheet.receiptEvidence(row,ledger),/참가 확인 필요/);
 assert.match(sheet.receiptEvidence({...row,party_size:3},ledger),/일행 별도/);
 assert.match(sheet.receiptEvidence({...row,game_no:'5'},ledger),/미방문 판정 아님/);
 assert.match(sheet.receiptEvidence({...row,is_default_queue:true},ledger),/게임 배정/);
 assert.match(sheet.receiptEvidence(row,[...ledger,...ledger]),/복수 기록/);
 await sheet.syncReservationSheet([row]);
 const writes=calls.filter(c=>c.init.method&&c.init.method!=='GET');
 assert.equal(writes.length,1);assert.match(decodeURIComponent(writes[0].url),/'예약 현황'!A1:R2\?valueInputOption=RAW/);
 assert.ok(!decodeURIComponent(writes[0].url).includes('일일 입력'));
 assert.equal(values[1][13],row.guest_note,'formula-looking input remains RAW text');
 assert.match(values[1][11],/방문 미확인/,'receipt match must not mark attendance');
 mismatch=true;await assert.rejects(()=>sheet.syncReservationSheet([row]),/readback/);mismatch=false;
 assert.equal(agent.reservationActionKeyboard('test',{status:'confirmed',request_kind:'change'}).inline_keyboard[0][0].callback_data,'rr:confirm:test');
 assert.equal(agent.reservationActionKeyboard('test',{status:'confirmed',request_kind:'none'}).inline_keyboard[0][0].callback_data,'rr:cancel:test');
 assert.equal(agent.reservationActionKeyboard('test',{status:'confirmed',request_kind:'cancel'}).inline_keyboard[0][0].text,'APPROVE CANCEL');
 assert.match(agent.reservationMessage({reservation_id:'test',version:1,event:'updated',status:'confirmed',player_name:'TEST',arrival_at:row.arrival_at,party_size:2,game_title:'5M',table_no:'5',game_no:'4',request_kind:'change',proposed:{party_size:3,arrival_at:row.arrival_at},proposed_game:'5M · Table 5 / No.5'}),/Game: 5M · Table 5 \/ No.5/);
 console.log('Reservation checks passed: receipt-only financial source, exact ledger hints, no automatic attendance, RAW reservation-only writes, readback failure, Telegram transitions.');
})().catch(e=>{console.error(e);process.exitCode=1});
