// Read-only reproductions of failures observed in Dream Staff on 2026-10-21.
// Expected state is derived from the staff-corrected daily sheet, not old bot plans.
const day=46316;
export const auditMaster=[['PLAYER','CARD','AGENCY'],['LEE KWANG TAE','4425','KOREA'],['KIM SEON HAK','2445','KOREA'],['CORDINGLEY OLIVER JAMES','','UK'],['KIM YOUNG IL','3430','KOREA'],['LEE SUNG WON','','KOREA'],['KIM HYUNG WOON','','HOUSE'],['CHANG YOON HO','','KOREA2'],['KIM HYUNG WOOK','3458','KOREA'],['PARK JAE RIM','','KOREA']];
export const auditDaily=[['NUMBER'],[7,day,'13-2','5M','LEE KWANG TAE','','',1],['',day,'13-2','5M','KIM SEON HAK','','',1],['',day,'13-2','5M','CORDINGLEY OLIVER JAMES','','',1],[],[8,day,'12-2','5M','LEE SUNG WON','','',1]];
export const auditCases:Record<string,{text:string;previous?:any;rules?:any[];expected:string}>={
 agency_followup:{text:'국가가 KOREA임',previous:{message_id:61,status:'review',text:'KIM BEONCHANG 신규면 플레이어 명단에도 추가하고 8번게임 시트에 반영해',plan:{pendingQuestion:'KIM BEONCHANG 소속 코드를 알려주세요.',operations:[{kind:'register',player:'KIM BEONCHANG'},{kind:'add',date:'2026-10-21',game:8,table:12,blind:'5M',player:'KIM BEONCHANG',buyins:1}]}},expected:'register KIM BEONCHANG with KOREA and add to game 8 without asking for a card'},
 confirm_registration:{text:'응 신규 등록하고 반영해',previous:{message_id:61,status:'review',text:'2026-10-21 8번 게임 12번 테이블 5M KIM BEONCHANG 1바인 KOREA',plan:{pendingQuestion:'KIM BEONCHANG을 신규 등록할까요?',operations:[{kind:'add',date:'2026-10-21',game:8,table:12,blind:'5M',player:'KIM BEONCHANG',buyins:1}]}},expected:'register and add in one plan, no repeated agency question'},
 rebuy_wrong_print:{text:'2026-10-21 13번 테이블 5M 레벨4 리바인 체크. 종이에 No.8이라고 나오지만 이전 게임 리바인 명단이야. LEE KWANG TAE 200000 KIM SEON HAK 100000 CORDINGLEY OLIVER JAMES 400000',expected:'update existing game 7 totals 2/1/4, never append game 8'},
 future_deposit:{text:'재림님 오시면 바인 성현행님 디파짓으로',expected:'no immediate spreadsheet transaction and no irrelevant clarification'},
 five_floor_fnb:{text:'2026-10-21 5층 대진형님 아메 한잔 총 60000동 F&B 추가',expected:'one 5F expense for 60000 VND'},
 spacing:{text:'2026-10-21 9번게임 4번 테이블 5M KIM HYUNG WOOK 2바인, PARK JAE RIM 1바인 반영해',expected:'game 9 below game 8 with one blank row and one heading'}
};
