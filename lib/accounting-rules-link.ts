import {createHmac,timingSafeEqual} from 'crypto';
export const rulesLinkText='업무 규칙은 아래 버튼에서 확인해주세요.';
const signature=(expiry:string,key:string)=>createHmac('sha256',key).update('dream-staff:rules:read:'+expiry).digest('hex');
export function rulesTicket(key:string,now=Date.now()){
 if(!key)throw Error('Rules link signing unavailable');
 const expiry=String(Math.floor(now/1000)+86400);
 return expiry+'.'+signature(expiry,key);
}
export function validRulesTicket(ticket:string,key:string,now=Date.now()){
 if(!key||!/^\d{10}\.[a-f0-9]{64}$/.test(ticket))return false;
 const [expiry,sig]=ticket.split('.');const remaining=Number(expiry)-Math.floor(now/1000);
 return remaining>=0&&remaining<=86400&&timingSafeEqual(Buffer.from(sig,'hex'),Buffer.from(signature(expiry,key),'hex'));
}
export function rulesButton(){
 const ticket=rulesTicket(process.env.ACCOUNTING_OPS_SECRET||'');
 return {inline_keyboard:[[{text:'📋 업무 규칙 보기',url:'https://dream-poker-reservation.vercel.app/desk/rules?access='+ticket}]]};
}
