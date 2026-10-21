import {createClient} from '@supabase/supabase-js';
import {projectUrl,tg} from './telegram';

export const reservationDb=()=>createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const alerts='local_reservation_alerts',actions='local_reservation_actions';
const target=()=>process.env.LOCAL_RESERVATION_TELEGRAM_CHAT_ID||'';

export function reservationKeyboard(deliveryId:string,text:string){
 const confirmed=/^Status: Confirmed$/m.test(text),cancelled=/^Status: Cancelled$/m.test(text);
 return {inline_keyboard:cancelled?[]:[[
  {text:confirmed?'CONFIRMED ✓':'CONFIRM',callback_data:`lr:${confirmed?'done':'confirm'}:${deliveryId}`},
  {text:'CONTACT DESK',callback_data:`lr:contact:${deliveryId}`}
 ]]};
}

export async function deliverReservationAlert(text:string,deliveryId:string,existingMessageId?:number){
 const db=reservationDb(),[bookingId,revision]=deliveryId.split(':'),version=Number(revision);
 const previous=await db.from(alerts).select('*').eq('booking_id',bookingId).order('version',{ascending:false}).limit(1).maybeSingle();
 if(previous.error)throw Error('Alert history unavailable');
 if(previous.data&&previous.data.version>version)return {message_id:Number(previous.data.message_id)};
 const messageId=previous.data?.message_id||existingMessageId;
 const reply_markup=reservationKeyboard(deliveryId,text);
 let receipt:any;
 if(messageId){
  try{receipt=await tg('editMessageText',{chat_id:target(),message_id:Number(messageId),text,reply_markup,link_preview_options:{is_disabled:true}},10000);}
  catch(error){if(!String(error).includes('message is not modified'))throw error;receipt={message_id:Number(messageId)};}
 }else{
  receipt=await tg('sendMessage',{chat_id:target(),text,reply_markup,link_preview_options:{is_disabled:true}},10000);
 }
 if(!Number.isSafeInteger(receipt.message_id))throw Error('Missing receipt');
 const saved=await db.from(alerts).upsert({delivery_id:deliveryId,booking_id:bookingId,version,chat_id:target(),message_id:receipt.message_id,text},{onConflict:'delivery_id'});
 if(saved.error)throw Error('Alert receipt not saved');
 return {message_id:receipt.message_id};
}

export async function handleReservationCallback(update:any):Promise<boolean>{
 const q=update?.callback_query;
 if(typeof q?.data!=='string'||!q.data.startsWith('lr:'))return false;
 const answer=async(text:string)=>{try{await tg('answerCallbackQuery',{callback_query_id:q.id,text,show_alert:true},5000);}catch{/* Expired callback acknowledgements must not replay a saved action. */}};
 const match=/^lr:(confirm|contact|done):([a-f0-9]{32}):([0-9]{1,6})$/.exec(q.data);
 if(!match||String(q.message?.chat?.id)!==target()||!Number.isSafeInteger(q.from?.id)||q.from?.is_bot||!Number.isSafeInteger(q.message?.message_id)){
  await answer('Use the buttons in the reservation staff group.');return true;
 }
 const [,kind,bookingId,revision]=match,version=Number(revision),db=reservationDb();
 const latest=await db.from(alerts).select('*').eq('booking_id',bookingId).order('version',{ascending:false}).limit(1).maybeSingle();
 if(latest.error)throw Error('Reservation lookup unavailable');
 const row=latest.data;
 if(!row||String(row.chat_id)!==target()||Number(row.message_id)!==q.message.message_id||row.version!==version){await answer('This reservation changed. Use the latest message.');return true;}
 const member=await tg('getChatMember',{chat_id:target(),user_id:q.from.id},5000);
 if(!['creator','administrator','member'].includes(member.status)){await answer('Only reservation staff group members can use these buttons.');return true;}
 if(kind==='done'||/^Status: Cancelled$/m.test(row.text)){await answer('This reservation is already processed.');return true;}
 const saved=await db.from(actions).upsert({delivery_id:row.delivery_id,booking_id:bookingId,version,action:kind,actor_id:q.from.id,actor_name:[q.from.first_name,q.from.last_name].filter(Boolean).join(' ').slice(0,100)||String(q.from.id)},{onConflict:'delivery_id,action',ignoreDuplicates:true});
 if(saved.error)throw Error('Reservation action not saved');
 const current=await db.from(actions).select('state,result').eq('delivery_id',row.delivery_id).eq('action',kind).single();
 if(current.error)throw Error('Reservation action unavailable');
 const done=current.data.state==='done';
 await answer(done?(current.data.result?.ok?'Already processed.':current.data.result?.message||'Please check with the desk.'):(kind==='confirm'?'Request saved. Wait for CONFIRMED on this message.':'Request saved. Please contact the Korean desk on KakaoTalk.'));
 return true;
}

export async function pendingReservationActions(){
 const result=await reservationDb().from(actions).select('id,booking_id,version,action,actor_id,actor_name').eq('state','pending').order('created_at').limit(5);
 if(result.error)throw Error('Action queue unavailable');
 return result.data||[];
}

export async function acknowledgeReservationAction(id:string,ok:boolean,message:string){
 const db=reservationDb();
 const found=await db.from(actions).select('state,delivery_id').eq('id',id).maybeSingle();
 if(found.error||!found.data)throw Error('Action not found');
 if(found.data.state==='done')return;
 if(!ok){
  const alert=await db.from(alerts).select('message_id,chat_id').eq('delivery_id',found.data.delivery_id).single();
  if(alert.error||String(alert.data.chat_id)!==target())throw Error('Action destination mismatch');
  await tg('sendMessage',{chat_id:target(),text:'Reservation action not completed.\n'+message,reply_parameters:{message_id:Number(alert.data.message_id)}},10000);
 }
 const saved=await db.from(actions).update({state:'done',result:{ok,message}}).eq('id',id).eq('state','pending');
 if(saved.error)throw Error('Action result not saved');
}
