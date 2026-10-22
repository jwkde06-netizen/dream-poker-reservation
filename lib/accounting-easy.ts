export const easyHelp='무엇을 도와드릴까요?\n사진만 올려도 기록할 수 있어요.';
export const easyMenu={inline_keyboard:[[{text:'📷 바이인 사진 올리기',callback_data:'desk:buyin'},{text:'☕ F&B 기록',callback_data:'desk:fnb'}],[{text:'📌 처리 상태',callback_data:'desk:status'},{text:'📋 업무 규칙',callback_data:'desk:rules'}],[{text:'📄 정산 시트',url:'https://docs.google.com/spreadsheets/d/1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I/edit'}]]};
export function parseDeskAction(data:string){
 if(/^desk:(buyin|fnb|status|rules)$/.test(data))return {kind:data.slice(5)};
 const m=data.match(/^desk:(manual|retry):(\d{1,15})$/);return m?{kind:m[1],messageId:Number(m[2])}:null;
}
export function pendingButtons(messageId:number){return {inline_keyboard:[[{text:'✍️ 직접 입력했어요',callback_data:'desk:manual:'+messageId}],[{text:'📖 사용 방법',callback_data:'desk:buyin'}]]};}
export function canMarkManual(job:any,actor:string,isAdmin:boolean){
 return !!job&&['review','failed','applied'].includes(job.status)&&(job.status!=='applied'||!!job.plan?.pendingQuestion)&&!job.plan?.resolvedBy&&!job.plan?.manual_handoff&&(String(job.sender_id)===actor||isAdmin);
}
export const buyinGuide='종이 바이인 명단을 한 장씩 찍어 올려주세요.\n우리 선수는 동그라미로, 실제 게임번호는 펜으로 표시하면 돼요.\n\n리바인도 같은 게임 명단의 누적 칩이 보이게 올려주세요. 수정 요청은 해당 사진에 답장해주세요.';
