const assert=require('node:assert/strict');
const {staffStatus}=require('../.test-build/accounting-status');
const failed={update_id:10,message_id:225,status:'failed',failure_reason:'AI_RESPONSE_INVALID:malformed_json',source_message:{date:1792662308,photo:[{}]},plan:{}};
let view=staffStatus([failed]);
assert(!view.text.includes('225'));assert(!view.text.includes('AI_RESPONSE'));
assert.equal(view.buttons.inline_keyboard[0][0].callback_data,'desk:retry:225');
assert(view.buttons.inline_keyboard[0][0].text.includes('해당 사진 다시 처리'));
for(const change of [{status:'uncertain'},{status:'writing'},{failure_reason:'HTTP 401'},{plan:{photoRetryCount:3}},{plan:{changes:[{}]}}]){
 view=staffStatus([{...failed,...change}]);assert(!JSON.stringify(view.buttons).includes('desk:retry:'));
}
assert.equal(staffStatus([failed,{...failed,update_id:11,status:'applied'}]).buttons.inline_keyboard.length,0);
assert.equal(staffStatus([{...failed,plan:{manual_handoff:{}}}]).buttons.inline_keyboard.length,0);
assert.equal(staffStatus([]).text,'지금 확인할 항목은 없어요.');
console.log('Status: human labels, eligible retries only, latest edits, manual handoff passed');
