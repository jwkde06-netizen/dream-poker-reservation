import {db,ranges} from './accounting-agent';
import {tg} from './telegram';
import {summarizeDay} from './accounting-report-summary';

// Separate room: no photos, accounting writes, conversational replies or AI calls.
export async function handleReportRoom(update:any){
 const target=process.env.ACCOUNTING_REPORT_CHAT_ID,m=update.message;
 if(!target||String(m?.chat?.id)!==target)return false;
 if(!['group','supergroup'].includes(m.chat.type)||!m.from?.id||m.from.is_bot||m.sender_chat)return true;
 const match=String(m.text||'').trim().match(/^\/(start|close)(?:@dream_poker_reservation_bot)?(?:\s+(20\d\d-\d\d-\d\d))?$/i);
 if(!match||!Number.isSafeInteger(update.update_id))return true;
 const member=await tg('getChatMember',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID,user_id:m.from.id});
 if(!['creator','administrator'].includes(member.status))return true;
 let date:string|undefined=match[2];let text='',summary:any=null;
 const command=match[1].toLowerCase();
 if(command==='start')text='일일보고방 연결 완료 ✅\n마감할 때 /close YYYY-MM-DD 를 입력해주세요.\n예: /close 2026-10-22';
 else if(!date)text='마감할 날짜를 함께 입력해주세요. 예: /close 2026-10-22';
 else{
  try{
   const busy=await db().from('dream_accounting_jobs').select('update_id').in('status',['received','processing','writing','uncertain']).limit(1);
   if(busy.error)throw Error('처리 상태를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
   if(busy.data?.length)throw Error('아직 처리 중이거나 확인이 필요한 기록이 있어요. 처리 후 마감해주세요.');
   const [rows]=await ranges(["'일일 입력'!A:I"]);summary=summarizeDay(rows,date);text=date+'\n'+summary.text;
  }catch(e){text=e instanceof Error?e.message:'정산 시트를 확인하지 못했어요.';date=undefined;}
 }
 // A unique day key prevents repeated closing commands from posting twice.
 // Keep uncertain sends for review rather than blindly retrying Telegram.
 const key=summary?target+':'+date:target+':update:'+update.update_id;
 const ins=await db().from('dream_desk_reports').insert({report_key:key,chat_id:target,report_date:summary?date:null,update_id:update.update_id,status:'sending',body:text,summary});
 if(ins.error){if(ins.error.code==='23505')return true;throw Error('Report persistence unavailable');}
 try{
  const sent=await tg('sendMessage',{chat_id:target,text,reply_parameters:{message_id:m.message_id,allow_sending_without_reply:true}},15000);
  const saved=await db().from('dream_desk_reports').update({status:'sent',message_id:sent.message_id}).eq('report_key',key);
  if(saved.error)throw Error('Report receipt persistence failed');
 }catch{
  await db().from('dream_desk_reports').update({status:'uncertain'}).eq('report_key',key);
 }
 return true;
}
