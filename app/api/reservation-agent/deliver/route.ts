import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl,tg,telegramToken} from '../../../../lib/telegram';
import {reservationMessage,reservationActionKeyboard} from '../../../../lib/reservation-agent';
export const runtime='nodejs';
export const maxDuration=30;
export async function POST(request:Request){
 const body=await request.json().catch(()=>null);
 if(typeof body?.notification_token!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.notification_token))return NextResponse.json({error:'Invalid job'},{status:400});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)return NextResponse.json({error:'Delivery service unavailable'},{status:503});
 const db=createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:job,error}=await db.rpc('claim_reservation_delivery',{p_token:body.notification_token});
 if(error)return NextResponse.json({error:'Queue unavailable'},{status:503});
 // Never reveal booking details or tokens in the HTTP response (pg_net stores it).
 if(!job)return NextResponse.json({ok:true,claimed:false});
 let messageId:number;
 try{
  const target=String(job.target||process.env.TELEGRAM_CHAT_ID||'');
  if(!target)throw Error('Telegram destination is not configured');
  const payload={chat_id:target,text:reservationMessage(job.payload),reply_markup:reservationActionKeyboard(job.id,job.payload),link_preview_options:{is_disabled:true}};
  let result;
  if(job.message_id){
   try{result=await tg('editMessageText',{...payload,message_id:Number(job.message_id)},10000);}
   catch(error){
    if(String(error).includes('message is not modified'))result={message_id:Number(job.message_id)};
    else if(String(error).includes('message to edit not found'))result=await tg('sendMessage',payload,10000);
    else throw error;
   }
  }else result=await tg('sendMessage',payload,10000);
  messageId=result.message_id;
  if(!Number.isSafeInteger(messageId))throw Error('Telegram receipt missing');
 }catch{
  // Do not persist arbitrary upstream error strings, URLs or credentials.
  await db.rpc('finish_reservation_delivery',{p_id:job.id,p_claim:job.claim_id,p_error:'Telegram delivery failed. Check bot permissions and group settings.'});
  return NextResponse.json({error:'Delivery will be retried'},{status:502});
 }
 const receipt=await db.rpc('finish_reservation_delivery',{p_id:job.id,p_claim:job.claim_id,p_message_id:messageId});
 if(receipt.error||!receipt.data)return NextResponse.json({error:'Receipt unavailable'},{status:503});
 return NextResponse.json({ok:true});
}

export async function GET(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!telegramToken)return NextResponse.json({ready:false},{status:503});
 const db=createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const check=await db.rpc('claim_reservation_delivery',{p_token:'00000000-0000-0000-0000-000000000000'});
 return NextResponse.json({ready:!check.error},{status:check.error?503:200,headers:{'Cache-Control':'no-store'}});
}
