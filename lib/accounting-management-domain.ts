export const managementHelp='Dream Bot 관리실 연결 완료 ✅\n\n이 방에 업무 규칙을 보내면 직원방 정산에도 공통 적용합니다.\n• 규칙 저장: 앞으로 …\n• 규칙 목록\n• 규칙 삭제 123\n\n사진·바이인·F&B 입력 지시는 이 방에서 실제 정산에 반영하지 않습니다. 직원방과 관리실의 관리자만 규칙을 변경할 수 있습니다.';
export function managementCommand(text:string){
 const t=text.trim().replace(/@dream_poker_reservation_bot(?=\s|$)/ig,'');
 if(/^(?:관리실\s*연결|\/관리실|\/link_rules)$/.test(t))return {action:'link' as const};
 if(/^(?:\/start|\/help|도움말)$/.test(t))return {action:'help' as const};
 if(/^(?:\/rules|규칙\s*목록|저장된\s*규칙(?:\s*(?:보여줘|보기))?)$/.test(t))return {action:'list' as const};
 const remove=t.match(/^(?:\/delete|규칙\s*삭제)\s+(\d+)$/);
 if(remove)return {action:'delete' as const,id:Number(remove[1])};
 return null;
}
export function managementMessage(update:any,staffChat:string,reportChat:string){
 const m=update?.message;
 if(!m||(!m.text&&!m.caption&&!m.photo&&!m.document)||!staffChat||String(m.chat?.id)===staffChat||String(m.chat?.id)===reportChat)return null;
 if(!['group','supergroup'].includes(m.chat?.type)||!m.from?.id||m.from.is_bot||m.sender_chat||
  !Number.isSafeInteger(update.update_id)||!Number.isSafeInteger(m.message_id))return null;
 return m;
}
export const managementAdmin=(status:string)=>['creator','administrator'].includes(status);
