import {deskCommand,politeAcknowledgement} from './accounting-conversation';
import {followupContext,HistoryJob} from './accounting-followup';

export function shouldProcessStaffMessage(m:any,recent:HistoryJob[]=[]){
 if(m.photo||m.document)return true;
 // Ignore exact completion notices, not instructions or corrections.
 const notice=String(m.text||'').trim().split(/\r?\n/).map((s:string)=>s.trim()).filter(Boolean);
 if(notice.length&&/^(?:(?:\d+\s*번\s*)+게임\s*|(?:\d+\s*번\s*)+)?(?:바이인\s*기록|리바인\s*체크|F\s*&\s*B\s*기록)\s*완료\s*✅?$/.test(notice[0])&&notice.slice(1).every((s:string)=>/^[A-Z][A-Z .'-]+\s+총\s*\d+\s*바인\s*✅?$/.test(s)))return false;
 if(/^\//.test(String(m.text||'').trim()))return !!deskCommand(m.text);
 if(politeAcknowledgement(String(m.text||''),!!m.reply_to_message?.from?.is_bot))return true;
 const t=String(m.text||m.caption||'').trim();
 // Staff corrections to completed jobs are still work, even without '시트'.
 // Named ownership corrections are accounting work, not casual conversation.
 if(/(?:우리|저희)\s*(?:쪽\s*)?(?:정산\s*)?코드(?:가|는|에|로)?\s*(?:아님|아니|아닙|아닌|맞|대상|등록|제외)/.test(t))return true;
 if(/(?:선수|플레이어|님).*소속.*(?:아님|아니|잘못|수정|변경)/.test(t))return true;
 if(/(?:기록|입력|반영).*(?:안\s*되|안\s*됐|안\s*되어|안\s*돼|누락|빠|잘못)|(?:누락|빠졌|잘못).*(?:기록|입력|반영)|우리\s*코드.*\d+\s*명/.test(t))return true;
 if(/(?:아메리카노|커피|라떼|주스|박시우|콜라|아아).*(?:잔|추가|기록)/.test(t))return true;
 if(/규칙|기억해|앞으로|^\/(start|help)|정산상태|처리상태|미처리|시트|정산|F\s*&\s*B|영수증|바이?인|리바인|레벨\s*\d|LV\s*\d/i.test(t))return true;
 if(/(?:게임|테이블).*(?:추가|반영|입력|수정|취소|삭제)|(?:추가|반영|입력|수정|취소|삭제).*(?:게임|테이블)|신규.*(?:등록|선수|플레이어)/.test(t))return true;
 // Brief answers have meaning only when tied to a real, still-open task.
 const previous=followupContext(recent,m,['KOREA','KOREA2','UK','HOUSE','JAPAN','MONGOL']);
 if(previous?.plan?.pendingQuestion)return true;
 if(previous&&m.reply_to_message&&/추가|수정|취소|삭제|반영|리바인/.test(t))return true;
 return false;
}

export function resolveFnb(ops:any[],menu:any[][]){
 const normalize=(s:any)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9가-힣]/g,'');
 // Remove only a known size suffix, never a flavour or arbitrary substring.
 const menuName=(s:any)=>normalize(String(s||'').replace(/\s*-\s*large\s*$/i,''));
 return (Array.isArray(ops)?ops:[]).map(o=>{
  if(o.kind!=='fnb')return o;
  const fixed={...o,floor:!o.floor||o.floor==='5F'?'2F':o.floor};
  const explicit=Number.isSafeInteger(o.amount)&&o.amount>0;
  const items=Array.isArray(o.items)&&o.items.length?o.items:null;
  if(!items)return fixed;
  let amount=0;const notes:string[]=[];
  for(const item of items){
   if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)return fixed;
   const name=menuName(item.menu);if(!name)return fixed;
   const matches=menu.slice(1).filter(r=>[r[0],...String(r[1]||'').split('|')].some(a=>menuName(a)===name));
   if(matches.length!==1||!Number.isSafeInteger(matches[0][2])||matches[0][2]<=0)return fixed;
   amount+=matches[0][2]*item.quantity;notes.push(matches[0][0]+' '+item.quantity+String(matches[0][3]||'잔'));
  }
  // Preserve an explicit bill total while still normalizing the Korean note.
  return {...fixed,amount:explicit?o.amount:amount,note:o.recipient?o.recipient+' '+notes.join('·'):o.note||notes.join('·')};
 });
}
