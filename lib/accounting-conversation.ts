// Staff-room commands are deterministic: no model call or ledger write.
export const deskCommands=[
 {command:'help',description:'사용 방법'},
 {command:'status',description:'AI 모델 · 시트 연결 · 처리 상태'},
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
export {easyHelp as deskHelp} from './accounting-easy';
export function politeAcknowledgement(text:string,replyToBot:boolean){
 if(!replyToBot)return null;
 if(/^(?:고마워|고맙습니다|감사합니다|수고했어|수고했어요)[.!~\s]*$/.test(text.trim()))return '네, 필요하시면 말씀해주세요.';
 return null;
}
export function completionReply(operations:any[],question:any,answeredQuestion:boolean,verified?:{summary:string[];changes:any[]}){
 // The planner knows which requests were skipped, already present or changed.
 // Do not report the model's proposed operations as completed work.
 if(verified){
  const skipped=verified.summary.some(line=>/건너뛰/.test(line));
  if(question)return [verified.changes.length?'확인된 항목만 구글 시트에 반영했어요.':null,String(question)].filter(Boolean).join('\n');
  if(skipped)return '일부 항목은 기존 기록을 유지했어요. 확인이 필요해요.';
  return verified.changes.length?'✅ 구글 시트 반영 완료':'✅ 구글 시트에 이미 반영되어 있어요.';
 }
 if(question)return `확인된 항목은 기록했어요. ${String(question)}`;
 const attendance=(operations||[]).filter(o=>['add','total','cancel'].includes(o.kind));
 const games=Array.from(new Set(attendance.map(o=>o.game).filter(g=>Number.isInteger(g)&&g>0)));
 if(attendance.length&&games.length&&!operations.some(o=>o.kind==='fnb')){
  return games.sort((a,b)=>a-b).map(game=>{
   const entries=attendance.filter(o=>o.game===game);
   const rebuy=entries.every(o=>o.kind==='total');
   const cancelled=entries.every(o=>o.kind==='cancel');
   const title=game+'번 게임 '+(cancelled?'선수 삭제 완료 ✅':rebuy?'리바인 체크 완료 ✅':'바이인 기록 완료 ✅');
   const totals=rebuy?entries.filter(o=>o.buyins>1).map(o=>o.player+' 총 '+o.buyins+'바인'):[];
   return [title,...Array.from(new Set(totals))].join('\n');
  }).join('\n');
 }
 const done=operations?.length&&operations.every(o=>o.kind==='fnb')?'F&B 기록 완료 ✅':operations?.some(o=>['add','total','cancel'].includes(o.kind))?'바이인 기록 완료 ✅':'완료 ✅';
 return answeredQuestion?'네, 확인했습니다.\n'+done:done;
}

export function addressedToDesk(text:string){
 return /@dream_poker_reservation_bot(?![a-z0-9_])/i.test(text);
}
export function sheetStatusQuestion(text:string){
 const clean=text.replace(/@dream_poker_reservation_bot(?![a-z0-9_])/gi,'').trim();
 return /시트|입력|반영|처리|기록/.test(clean)&&/(?:됐|됬|되었|된|됐는|했|끝났|완료|상태|누락|미처리)/.test(clean)&&/(?:[?？]|거야|나요|니$|는지|알려|확인|상태|누락|미처리)/.test(clean)&&!/(?:추가해|수정해|삭제해|넣어|입력해|반영해|처리해)/.test(clean);
}
