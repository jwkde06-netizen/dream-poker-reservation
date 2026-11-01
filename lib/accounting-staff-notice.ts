// True means ACK without calling any accounting handler. Only current message text
// is inspected: a quoted receipt or a quoted checklist is not the new request.
export function ignoreStaffNotice(update:any, staffId:string|undefined):boolean {
  if (!staffId || update?.callback_query) return false;
  const m = update?.message ?? update?.edited_message;
  if (!m || String(m.chat?.id) !== staffId || !['group','supergroup'].includes(m.chat?.type)) return false;
  if (m.photo || m.document || typeof m.text !== 'string') return false;
  const text: string = m.text.normalize('NFKC').trim();
  if (!text || /^\//.test(text) || /@dream_poker_reservation_bot\b/i.test(text)) return false;
  // These are social reactions, NOT yes/no answers to pending ledger questions.
  if (/^(?:굿+|수고하셨습니다|좋은\s*아침(?:입니다)?|chào cả nhà|good morning|👍(?:🏻|🏼|🏽|🏾|🏿)?)[\s.!~👍]*$/i.test(text)) return true;
  const first = text.split(/\r?\n/,1)[0].trim();
  const heading = /^(?:.{0,55}(?:체크\s*리스트|업무\s*공지|근무\s*공지|인수인계\s*사항|오픈\s*안내|opening checklist|shift checklist|checklist mở ca|thông báo ca)(?:\s*[:：\]】.!✅])?\s*$|(?:📢\s*)?[\[【](?:직원\s*공지|업무\s*공지|공지|thông báo)[\]】])/i.test(first);
  const opening = /(?:게임|매장|오픈)\s*준비\s*(?:가\s*)?(?:완료|됐|되었)|타임\s*어택.{0,24}(?:시작|오픈)/i.test(text) && /예약|오픈\s*채팅|1\s*:\s*1/.test(text);
  if (!heading && !opening) return false;
  // Don't lose a concrete ledger correction bundled with a shift notice.
  const transaction = text.split(/\r?\n|[;；]/).some(line =>
    /(?:\d+\s*번\s*(?:게임|테이블)|(?:게임|테이블)\s*\d+|\d[\d,.]*\s*(?:만\s*)?(?:동|vnd|바인)|\d+\s*잔)/i.test(line) &&
    /반영|시트.{0,25}(?:입력|추가|수정)|(?:바이?인|리바(?:인|이)|F\s*&\s*B|누락|선수|영수증).{0,32}(?:기록|입력|추가|정정|수정|삭제|취소|넣어|빼줘)/i.test(line));
  const currentRequest = /(?:시트|장부|원장)(?:에|에서|를|도)?[^\n.!?]{0,24}(?:반영|입력|추가|정정|수정|삭제)(?:해|해줘|해주세요)|(?:이|방금|위)\s*(?:영수증|바이인|리바인)[^\n.!?]{0,24}(?:반영|입력|추가|정정|수정)해/.test(text);
  return !transaction && !currentRequest;
}
