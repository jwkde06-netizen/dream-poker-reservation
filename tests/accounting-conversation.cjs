const assert=require('node:assert/strict');
const {deskCommands,deskCommand,politeAcknowledgement,completionReply}=require('../.test-build/accounting-conversation');
const {shouldProcessStaffMessage:gate}=require('../.test-build/accounting-intake');
for(const {command} of deskCommands){
 assert.equal(deskCommand('/'+command),command);
 assert.equal(gate({text:'/'+command}),true);
 assert.equal(deskCommand('/'+command+'@dream_poker_reservation_bot'),command);
 assert.equal(gate({text:'/'+command+'@other_bot'}),false);
}
assert.equal(politeAcknowledgement('감사합니다',false),null);
assert.equal(politeAcknowledgement('감사합니다',true),'네, 필요하시면 말씀해주세요.');
assert.equal(politeAcknowledgement('감사합니다 시트 수정해주세요',true),null);
assert.equal(completionReply([{kind:'total'}],null,false),'바이인 기록 완료 ✅');
assert.equal(completionReply([{kind:'total'}],null,true),'네, 확인했습니다.\n바이인 기록 완료 ✅');
assert.equal(completionReply([{kind:'fnb'}],null,false),'F&B 기록 완료 ✅');
assert.equal(completionReply([{kind:'total'}],'김지원님 코드는 무엇인가요?',true),'확인된 항목은 기록했어요. 김지원님 코드는 무엇인가요?');
console.log('Staff command routing and truthful concise acknowledgement checks passed');
