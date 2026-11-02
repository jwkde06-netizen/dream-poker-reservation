// Intake admits receipts and direct calls to the desk bot; ordinary staff conversation never reaches the AI.
const assert=require('node:assert/strict');
const {shouldProcessStaffMessage:gate,resolveFnb}=require('../.test-build/accounting-intake');
for(const text of ['위에 대기하는 분들 겜 안하신데 ?','박수민 추가','9번 자리 있습니다','6번 취소','네 시간없대요','리바인 체크','오늘 바이인 많네','레벨 3 올라갔어','영수증 어디 있어'])assert.equal(gate({text}),false,'unaddressed staff chat must not reach the AI: '+text);
for(const text of ['@dream_poker_reservation_bot 박수민 추가','@Dream_Poker_Reservation_Bot 6번 취소'])assert.equal(gate({text}),true,text);
assert.equal(gate({text:'6번 취소',reply_to_message:{message_id:5,from:{is_bot:true}}}),true,'reply to the bot is a direct call');
assert.equal(gate({text:'6번 취소',reply_to_message:{message_id:5,from:{is_bot:false}}}),false,'reply to a person is staff chat');
assert.equal(gate({text:'이건 6번게임이지',reply_to_message:{message_id:411}},[{reply_id:411}]),true,'reply to a stored bot reply id');
assert.equal(gate({text:'6번 취소',reply_to_message:{message_id:412}},[{reply_id:411}]),false);
for(const text of ['14번 게임 시트 반영해','우리끼리 대화하는 건 답장하지마. 규칙 저장','준기형님 아메리카노 1잔'])assert.equal(gate({text}),true,text);
assert.equal(gate({photo:[{}]}),true);
const menu=[['메뉴','별칭','단가'],['아메리카노','아아|Cà phê americano',60000],['오렌지주스','Nước cam',60000]];
const op={kind:'fnb',floor:'5F',amount:null,recipient:'준기형님',items:[{menu:'아메리카노',quantity:2}]};
assert.deepEqual(resolveFnb([op],menu)[0],{...op,floor:'2F',amount:120000,note:'준기형님 아메리카노 2잔'});
assert.equal(resolveFnb([{...op,floor:'3F',amount:100000}],menu)[0].amount,100000);
assert.equal(resolveFnb([{...op,items:[{menu:'미등록',quantity:1}]}],menu)[0].amount,null);
assert.equal(resolveFnb([{...op,items:[{menu:'아메리카노'}]}],menu)[0].amount,null);
assert.equal(resolveFnb([{...op,items:[{menu:'아메리카노',quantity:1},{menu:'오렌지주스',quantity:1}]}],menu)[0].amount,120000);
const {followupContext}=require('../.test-build/accounting-followup');
const pending={message_id:10,reply_id:11,sender_id:'7',status:'review',text:'영수증',created_at:'2026-10-21T10:00:00Z',plan:{pendingQuestion:'금액을 알려주세요.'}};
const msg=text=>({text,from:{id:7},date:Date.parse('2026-10-21T10:05:00Z')/1000});
for(const text of ['네','6만동','3층','2487','KOREA','국가가 KOREA임']){
 assert.equal(gate(msg(text)),false,'no pending task, no AI: '+text);
 assert.equal(gate(msg(text),[pending]),true,'pending: '+text);
}
assert.equal(gate(msg('네 시간없대요')),false);
assert.equal(gate(msg('네 시간없대요'),[pending]),false,'chat next to an open question is still chat');
assert.equal(gate({...msg('6만동'),from:{id:8}},[pending]),false,'another staff member cannot answer someone else\'s open question');
assert.equal(gate({...msg('6만동'),date:msg('').date+3600},[pending]),false,'stale open question window');
assert.equal(gate(msg('6만동'),[{...pending,plan:{...pending.plan,resolvedBy:12}}]),false,'resolved task no longer admits short answers');
const closed={...pending,plan:{...pending.plan,resolvedBy:12}};
assert.equal(followupContext([closed],{...msg('6만동'),reply_to_message:{message_id:11}},[]),null);
assert.equal(followupContext([pending],{...msg('앞으로 기본 2F 규칙 저장'),reply_to_message:{message_id:11}},[]),null);
assert.equal(gate(msg('6만동'),[{message_id:12,status:'ignored',plan:{contextMessageId:10}},pending]),true);
assert.equal(gate(msg('6만동'),[{message_id:12,status:'applied',plan:{contextMessageId:10}},pending]),false,'a question already answered by an applied job is closed');
assert.equal(gate({...msg('김지원 추가해'),reply_to_message:{message_id:10}},[{...pending,status:'applied',plan:{}}]),true);
console.log('Intake, closed-task, short-answer and F&B pricing regression checks passed');
for(const text of ['우리코드 5명인데 2명 밖에 기록이 안 되었어','기록이 안 됐어','3명이 누락됐어 시트 확인해'])assert.equal(gate({text}),true,text);

// Regression: message317 was silently dropped before any AI call.
for(const text of ["Ye gui cai 우리 코드 아님","YE GUI CAI는 우리 코드가 아니야","이 선수는 저희 정산 코드 대상 아님","김지원님 소속 잘못됐어"])assert.equal(gate({text}),true,text);
for(const text of ["우리 오늘 몇 시에 퇴근해?","중국인 손님 왔어","우리 코드 개발 중","YE GUI CAI 왔어"])assert.equal(gate({text}),false,'chat: '+text);
