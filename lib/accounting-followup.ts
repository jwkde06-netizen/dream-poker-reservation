import {bustAnswer,bustFollowupState,finalBuyins} from './accounting-bust-followup';
import {defaultAgency} from './accounting-workflow';
import {norm} from './accounting-plan';

export type HistoryJob={message_id:number;sender_id?:string;text:string;status:string;reply_id?:number;reply_text?:string;created_at?:string;source_message?:any;plan?:any};
export const closed=(r:HistoryJob)=>!!(r.plan?.manual_handoff||r.plan?.reconciliation||r.plan?.resolvedBy);
export function followupContext(recent:HistoryJob[],message:any,agencyCodes:string[]){
 const current=String(message.text||'').trim();
 // A new standing rule does not resume the quoted transaction.
 if(/규칙.*저장|기억해|앞으로/.test(current)&&!/(?:지금|이번|\d+번).*?(?:반영|적용|수정)/.test(current))return null;
 const reference=message.reply_to_message?.message_id;
 if(reference){let direct=recent.find(r=>r.message_id===reference||r.reply_id===reference);
  if(direct&&bustFollowupState(direct)){const seen=new Set<number>();while(direct&&!seen.has(direct.message_id)){seen.add(direct.message_id);const next=recent.find(r=>r.plan?.contextMessageId===direct!.message_id&&r.plan?.bustFollowup&&r.status!=='failed'&&r.status!=='ignored');if(!next)break;const before=bustFollowupState(direct)?.target,after=bustFollowupState(next)?.target;if(!after||['date','game','table','player'].some(k=>before[k]!==after[k]))break;direct=next;}return direct;}
  return direct&&!closed(direct)?direct:null;}
 if(message.photo||message.document)return null;
 const text=String(message.text||'').trim();
 const answer=text.length<=160&&(!!bustAnswer(text)||finalBuyins(text)!==null||/^(?:(?:총|누적)\s*)?\d{1,2}\s*바인(?:이에요|입니다|이야)?[.!]?$/.test(text)||/^(?:네|넵|응|예|맞아|맞아요|그래|추가해|등록해|그렇게)(?:[.!]|요|주세요| 해줘| 추가해| 등록해)*$/.test(text)||/^(?:국가|소속|코드|카드)(?:가|는|은|번호| 번호|\s)/.test(text)||/^\d+(?:[.,]\d+)?\s*(?:만|천)?\s*동[.!]?$/.test(text)||/^\d{1,8}$/.test(text)||/^[234]\s*(?:층|F)$/i.test(text)||/별다른.*없으면.*(코드|KOREA)|기본값|기본\s*코드/.test(text)||agencyCodes.some(c=>norm(text)===norm(c))||/^[가-힣 A-Za-z]{2,30}\s+\d{3,8}$/.test(text));
 if(!answer)return null;
 const candidates=recent.filter(r=>!closed(r)&&!recent.some(n=>n.status!=='ignored'&&n.plan?.contextMessageId===r.message_id)&&String(r.sender_id)===String(message.from?.id)&&r.plan?.pendingQuestion&&['review','applied'].includes(r.status)&&Number(message.date)*1000-Date.parse(r.created_at||'')>=0&&Number(message.date)*1000-Date.parse(r.created_at||'')<=45*60000);
 // Follow the latest unresolved question only, never a task already superseded
 // by another photo or explicit handoff from the same staff member.
 if(bustAnswer(text)&&(!bustFollowupState(candidates[0])||candidates.length!==1))return null;
 if(finalBuyins(text)!==null&&candidates.length>1&&candidates.some(r=>bustFollowupState(r)))return null;
 const pending=candidates[0];if(!pending)return null;
 const newer=recent.slice(0,recent.indexOf(pending));
 if(newer.some(r=>String(r.sender_id)===String(message.from?.id)&&(r.source_message?.photo||r.source_message?.document||r.plan?.manual_handoff)))return null;
 return pending;
}
export function continuationText(current:string,previous:HistoryJob|null){
 if(!previous||closed(previous))return current;
 return [previous.plan?.continuationText||previous.text,current].filter(Boolean).join('\n').slice(-5000);
}
// A circled, unregistered photo player is not authorization to create a master
// identity or infer an agency. Hold only that player; known attendance can pass
// the usual photo, correction, conflict and readback guards independently.
export function isolateUnapprovedRegistrations(ops:any[],evidence:string,master:any[][],pendingQuestion='',rules:any[]=[]){
 const named=norm([evidence,pendingQuestion,...rules.map(r=>r.content)].join(' '));
 const unapproved=ops.filter(op=>op.kind==='register'&&(!norm(op.player)||!named.includes(norm(op.player))));
 const blocked=new Set(unapproved.map(op=>norm(op.player)));
 const known=new Set(master.slice(1).filter(r=>r[0]&&String(r[2]||'').trim()).map(r=>norm(r[0])));
 const deferred=Array.from(new Set(unapproved.map(op=>String(op.player||'').trim()).filter(player=>norm(player)&&!known.has(norm(player)))));
 return {
  operations:ops.filter(op=>!blocked.has(norm(op.player))||(op.kind!=='register'&&known.has(norm(op.player)))),
  deferredRegistrations:deferred.map(player=>({player,reason:'named_registration_not_authorized'})),
  question:deferred.length?`${deferred[0]}님은 등록 확인이 필요해요. 정산 대상이면 소속 코드를 알려주세요.`:null
 };
}
export function registrationApprovals(ops:any[],evidence:string,master:any[][],pendingQuestion='',rules:any[]=[]){
 const codes=new Set(master.slice(1).map(r=>String(r[2]||'').trim()).filter(Boolean));
 const result:Record<string,{agency:string;card?:string}>={};
 for(const op of ops||[]){
  if(op.kind!=='register'||!op.agency)continue;
  const agency=String(op.agency).trim();
  const tokens:string[]=evidence.toUpperCase().match(/[A-Z]+[0-9]*(?:\([A-Z]+\))?/g)||[];
  if(!norm(evidence+' '+pendingQuestion).includes(norm(op.player))||!codes.has(agency)||(!tokens.includes(agency.toUpperCase())&&defaultAgency(rules,master)!==agency&&!master.slice(1).some(r=>norm(r[0])===norm(op.player)&&r[2]===agency)))throw Error(`${op.player} 소속 코드를 알려주세요.`);
  const card=op.card==null?'':String(op.card).trim();
  if(card&&(!/^\d{1,12}$/.test(card)||!new RegExp(`(?:^|\\D)${card}(?:$|\\D)`).test(evidence)))throw Error(`${op.player} 카드 번호를 확인해주세요.`);
  result[norm(op.player)]={agency,...(card?{card}:{})};
 }
 return result;
}
export const rebuyCaption=(text:string)=>/리바[인이]|리바이|rebuy|레벨\s*[34]\s*(리바인\s*)?체크|level\s*[34].*check/i.test(text);
