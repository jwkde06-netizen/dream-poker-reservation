import {createClient} from '@supabase/supabase-js';
import {projectUrl,tg} from './telegram';

// This namespace belongs to the public reservation site; lr: belongs to the local app.
export async function handlePublicReservationCallback(update:any):Promise<boolean>{
 const q=update?.callback_query;
 if(typeof q?.data!=='string'||!q.data.startsWith('rr:'))return false;
 const answer=async(text:string)=>{
  try{await tg('answerCallbackQuery',{callback_query_id:q.id,text,show_alert:true},5000);}
  catch{/* An expired acknowledgement must not undo or repeat a committed action. */}
 };
 const match=/^rr:(confirm|contact):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(q.data);
 if(!match||!Number.isSafeInteger(q.from?.id)||q.from.id<=0||q.from?.is_bot||!Number.isSafeInteger(q.message?.chat?.id)||q.message.chat.id>=0||!Number.isSafeInteger(q.message?.message_id)){
  await answer('Use the buttons in the reservation staff group.');return true;
 }
 const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const context={p_delivery:match[2],p_chat:String(q.message.chat.id),p_message:q.message.message_id};
 const found=await db.rpc('reservation_telegram_action_context',context);
 if(found.error)throw Error('Reservation lookup unavailable');
 if(!found.data){await answer('This reservation changed. Use the latest message.');return true;}
 const member=await tg('getChatMember',{chat_id:context.p_chat,user_id:q.from.id},5000);
 if(!['creator','administrator','member'].includes(member.status)){
  await answer('Only reservation staff group members can use these buttons.');return true;
 }
 const result=await db.rpc('apply_reservation_telegram_action',{
  ...context,p_action:match[1],p_actor:q.from.id,
  p_actor_name:[q.from.first_name,q.from.last_name].filter(Boolean).join(' ').slice(0,100)||String(q.from.id)
 });
 if(result.error)throw Error('Reservation action unavailable');
 const messages:Record<string,string>={
  confirmed:'Reservation confirmed.',contact:'Please contact the Korean desk on KakaoTalk.',
  unchanged:'Already processed.',stale:'This reservation changed. Use the latest message.',
  full:'No seats available. Please contact the desk.',closed:'This game is closed. Please contact the desk.',
  inactive:'This reservation can no longer be changed.'
 };
 await answer(messages[result.data?.result]||'Please check with the desk.');
 return true;
}
