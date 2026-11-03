const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const gate = require('../.test-build/accounting-intake').shouldProcessStaffMessage;
const msg = text => ({ text, from: { id: 7 }, date: Date.parse('2026-11-03T06:00:00Z') / 1000 });
const pending = { message_id: 10, reply_id: 11, sender_id: '7', status: 'review', text: '영수증', created_at: '2026-11-03T05:55:00Z', plan: { pendingQuestion: '금액을 알려주세요.' } };
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS '+name); } catch (e) { fail++; console.log('FAIL '+name+': '+e.message); } }
// Exact reported messages plus related shift-only examples.
for (const text of ['써니 씨 오늘 드림으로 3시 출근하면 돼요', '오늘 두 분 드림으로 오시면 돼요', '오늘 일단 다시 드림으로 출근~', '내일 세 분 드림으로 오시면 됩니다.', '오늘 출근했어요', '몇 시에 퇴근해요?', '내일 근무 누구예요?', '오늘 지각할 것 같아요', '휴무입니다', '교대 시간 알려주세요']) {
 check('ignore '+text, () => { assert.equal(gate(msg(text)), false); assert.equal(gate(msg(text), [pending]), false); });
}
for (const text of ['출근해서 8번 게임 반영해', '퇴근 전 박수민 추가', '근무 끝나기 전에 6번 취소', '출근해서 영수증 시트에 기록해', '앞으로 출근 때 규칙 기억해', '@dream_poker_reservation_bot 오늘 근무 질문']) check('preserve '+text, () => assert.equal(gate(msg(text)), true));
check('attachment preserved', () => assert.equal(gate({ ...msg('출근'), photo: [{}] }), true));
check('bot reply preserved', () => assert.equal(gate({ ...msg('출근했어요'), reply_to_message: { message_id: 11, from: { is_bot: true } } }, [pending]), true));
for (const text of ['네', '6만동', 'KOREA', '3층']) check('pending '+text, () => assert.equal(gate(msg(text), [pending]), true));
check('unclassified correction preserved', () => assert.equal(gate(msg('박수민 추가')), true));
for (const text of ['오늘 두 분 드림으로 오시면 돼요. 선수 등록해', '오늘 두 분 드림으로 오시면 돼요. 8번 게임 시트 반영해', '오늘 두 분 드림으로 오시면 돼요. 영수증 기록해']) check('mixed ledger request '+text, () => assert.equal(gate(msg(text)), true));
console.log(`${pass} passed, ${fail} failed; intake module only; no live calls`);
process.exitCode = fail ? 1 : 0;
