export function shouldProcessStaffMessage(m:any){
 if(m.photo||m.document)return true;
 const t=String(m.text||m.caption||'').trim();
 if(/(?:아메리카노|커피|라떼|주스|박시우|콜라|아아).*(?:잔|추가|기록)/.test(t))return true;
 if(/규칙|기억해|앞으로|^\/(start|help)|정산상태|처리상태|미처리|시트|정산|F\s*&\s*B|영수증|바이?인|리바인|레벨\s*\d|LV\s*\d/i.test(t))return true;
 if(/(?:게임|테이블).*(?:추가|반영|입력|수정|취소|삭제)|(?:추가|반영|입력|수정|취소|삭제).*(?:게임|테이블)|신규.*(?:등록|선수|플레이어)/.test(t))return true;
 // Short answers are considered only by the pending-request resolver later.
 if(/^(?:네|넵|예|맞아|맞아요|완료|\d+(?:만|천)?동|\d+바인|\d+번(?:째)?게임|KOREA2?|UK|HOUSE|JAPAN|MONGOL)$/i.test(t.replace(/\s/g,'')))return true;
 if(m.reply_to_message?.from?.is_bot&&/추가|수정|취소|삭제|[0-9]|KOREA|UK|HOUSE|소속|코드/i.test(t))return true;
 return false;
}

export function resolveFnb(ops:any[],menu:any[][]){
 const normalize=(s:any)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').normalize('NFC').toLowerCase().replace(/[^a-z0-9가-힣]/g,'');
 return ops.map(o=>{
  if(o.kind!=='fnb')return o;
  const fixed={...o,floor:!o.floor||o.floor==='5F'?'2F':o.floor};
  // Explicit receipt/staff totals win. Never infer price from a mixed bill.
  if(Number.isSafeInteger(o.amount)&&o.amount>0)return fixed;
  const items=Array.isArray(o.items)&&o.items.length?o.items:null;
  if(!items)return fixed;
  let amount=0;const notes:string[]=[];
  for(const item of items){
   if(!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)return fixed;
   const name=normalize(item.menu);const matches=menu.slice(1).filter(r=>[r[0],...String(r[1]||'').split('|')].some(a=>normalize(a)===name));
   if(matches.length!==1||!Number.isSafeInteger(matches[0][2])||matches[0][2]<=0)return fixed;
   amount+=matches[0][2]*item.quantity;notes.push(matches[0][0]+' '+item.quantity+'잔');
  }
  return {...fixed,amount,note:o.recipient?o.recipient+' '+notes.join('·'):o.note};
 });
}
