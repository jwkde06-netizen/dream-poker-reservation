import {createHash,timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {tg,telegramToken} from '../../../lib/telegram';
import {deliverReservationAlert,pendingReservationActions,acknowledgeReservationAction} from '../../../lib/reservation-local-actions';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const expectedUsername='dream_poker_reservation_bot';

function authorized(request:Request){
 const expected=process.env.LOCAL_RESERVATION_RELAY_KEY_SHA256||'';
 const raw=request.headers.get('authorization')||'';
 if(!/^[a-f0-9]{64}$/.test(expected)||!raw.startsWith('Bearer '))return false;
 const token=raw.slice(7);
 if(token.length<40||token.length>128)return false;
 return timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(expected,'hex'));
}
function reply(body:Record<string,unknown>,status=200){
 return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
}
async function destination(){
 const target=process.env.LOCAL_RESERVATION_TELEGRAM_CHAT_ID||'';
 if(!telegramToken||!/^-[0-9]{5,22}$/.test(target))throw new Error('Missing configuration');
 const [bot,chat]=await Promise.all([tg('getMe',{},6000),tg('getChat',{chat_id:target},6000)]);
 if(bot.username?.toLowerCase()!==expectedUsername||!['group','supergroup'].includes(chat.type)||String(chat.id)!==target)throw new Error('Destination mismatch');
 return {target,bot:{id:bot.id,username:bot.username,name:bot.first_name},chat:{id:chat.id,title:chat.title,type:chat.type}};
}

export async function GET(request:Request){
 if(!authorized(request))return reply({error:'Unauthorized'},401);
 try{const {bot,chat}=await destination();const hook=await tg('getWebhookInfo',{},6000);return reply({ok:true,bot,chat,webhook:{url:hook.url,allowed_updates:hook.allowed_updates||[]}});}
 catch{return reply({error:'Reservation bot or group unavailable'},503);}
}

export async function POST(request:Request){
 if(!authorized(request))return reply({error:'Unauthorized'},401);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'JSON required'},415);
 if(Number(request.headers.get('content-length')||0)>8192)return reply({error:'Payload too large'},413);
 const raw=await request.text();
 if(Buffer.byteLength(raw)>8192)return reply({error:'Payload too large'},413);
 let body:unknown;
 try{body=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Invalid request'},400);
 const {text,delivery_id,sent_at,operation,existing_message_id,action_id,ok,message}=body as Record<string,unknown>;
 if(typeof sent_at!=='number'||!Number.isSafeInteger(sent_at)||Math.abs(Date.now()/1000-sent_at)>120)return reply({error:'Expired request'},400);
 if(operation==='poll'){
  try{return reply({ok:true,actions:await pendingReservationActions()});}catch{return reply({error:'Action queue unavailable'},503);}
 }
 if(operation==='ack'){
  if(typeof action_id!=='string'||!/^[a-f0-9-]{36}$/.test(action_id)||typeof ok!=='boolean'||typeof message!=='string'||message.length>300)return reply({error:'Invalid result'},400);
  try{await acknowledgeReservationAction(action_id,ok,message);return reply({ok:true});}catch{return reply({error:'Action result not saved'},503);}
 }
 if(operation!==undefined&&operation!=='sync')return reply({error:'Unknown operation'},400);
 if(existing_message_id!==undefined&&(!Number.isSafeInteger(existing_message_id)||Number(existing_message_id)<=0))return reply({error:'Invalid receipt'},400);
 if(typeof text!=='string'||text.length>1800||!/^DREAM POKER · (RESERVATION|UPDATE)\nName: /.test(text)
   ||typeof delivery_id!=='string'||!/^[a-f0-9]{32}:[0-9]{1,6}$/.test(delivery_id)
   ||typeof sent_at!=='number'||!Number.isSafeInteger(sent_at)||Math.abs(Date.now()/1000-sent_at)>120){
   return reply({error:'Invalid or expired reservation alert'},400);
 }
 try{
  await destination();
  const sent=await deliverReservationAlert(text,delivery_id,existing_message_id as number|undefined);
  if(!Number.isSafeInteger(sent.message_id))throw new Error('Missing receipt');
  return reply({ok:true,message_id:sent.message_id});
 }catch{
  // Do not echo upstream URLs, bot credentials or attendee details in errors.
  return reply({error:'Reservation alert not delivered. Retry from the local queue.'},502);
 }
}
