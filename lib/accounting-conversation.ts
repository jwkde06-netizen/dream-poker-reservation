// Staff-room commands are deterministic: no model call or ledger write.
export const deskCommands=[
 {command:'help',description:'사용 방법'},
 {command:'status',description:'처리 상태와 확인할 항목'},
 {command:'rules',description:'저장된 업무 규칙'},
 {command:'sheet',description:'정산 시트 열기'},
 {command:'menu',description:'F&B 메뉴 가격표'},
 {command:'fnb',description:'F&B 기록 방법'},
];
export function deskCommand(text:string){
 const m=text.trim().match(/^\/([a-z]+)(?:@([a-z0-9_]+))?\s*$/i);
 if(!m||m[2]&&m[2].toLowerCase()!=='dream_poker_reservation_bot')return null;
 return m[1].toLowerCase();
}
export const deskHelp='바이인 명단이나 영수증 사진을 올려주세요. 수정할 내용은 해당 사진에 답장해주시면 돼요.\n\n/status 처리 상태\n/rules 업무 규칙\n/sheet 정산 시트\n/menu 메뉴 가격표\n/fnb F&B 기록 방법';
export function politeAcknowledgement(text:string,replyToBot:boolean){
 if(!replyToBot)return null;
 if(/^(?:고마워|고맙습니다|감사합니다|수고했어|수고했어요)[.!~\s]*$/.test(text.trim()))return '네, 필요하시면 말씀해주세요.';
 return null;
}
export function completionReply(operations:any[],question:any,answeredQuestion:boolean){
 if(question)return `확인된 항목은 기록했어요. ${String(question)}`;
 const done=operations?.length&&operations.every(o=>o.kind==='fnb')?'F&B 기록 완료 ✅':operations?.some(o=>['add','total','cancel'].includes(o.kind))?'바이인 기록 완료 ✅':'완료 ✅';
 return answeredQuestion?'네, 확인했습니다.\n'+done:done;
}
