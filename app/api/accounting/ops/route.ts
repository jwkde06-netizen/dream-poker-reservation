import {NextResponse} from 'next/server';
import {authorized,db,extract,ranges} from '../../../../lib/accounting-agent';
import {tg} from '../../../../lib/telegram';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const url='https://dream-poker-reservation.vercel.app/api/accounting/webhook';
export async function POST(request:Request){
 if(!authorized(request,'ACCOUNTING_OPS_SECRET'))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const {action}=await request.json();
  if(action==='inspect'){
   const me=await tg('getMe'),chat=await tg('getChat',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID}),member=await tg('getChatMember',{chat_id:chat.id,user_id:me.id}),hook=await tg('getWebhookInfo');
   const data=await ranges(["'일일 입력'!A1:O2","'F&B 입력'!A1:D1"],true);
   const q=await db().from('dream_accounting_jobs').select('update_id',{head:true,count:'exact'});
   return NextResponse.json({bot:me.username,chat:{id:chat.id,title:chat.title},visibility:member.status==='administrator'||me.can_read_all_group_messages===true,member_status:member.status,webhook:hook,google_headers:data[0]?.[0],google_formulas:[5,6,8,9,10,11,12,13,14].every(i=>String(data[0]?.[1]?.[i]||'').startsWith('=ARRAYFORMULA(')),database:!q.error,enabled:process.env.ACCOUNTING_ENABLED==='true'});
  }
  if(action==='modeltest'){const result=await extract('2026-10-21 3층 대표님 말차라떼 2잔 총 150000동 F&B 추가',undefined,{});return NextResponse.json({result});}
  if(action==='connect'){
   const me=await tg('getMe');if(me.username!=='dream_poker_reservation_bot')throw Error('Wrong bot');
   const chat=await tg('getChat',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID});if(String(chat.id)!=='-5322020390'||!['group','supergroup'].includes(chat.type))throw Error('Wrong group');
   const member=await tg('getChatMember',{chat_id:chat.id,user_id:me.id});if(member.status!=='administrator'&&me.can_read_all_group_messages!==true)throw Error('Bot needs group message visibility');
   const hook=await tg('getWebhookInfo');if(hook.url&&hook.url!==url)throw Error('Existing webhook must be preserved: '+hook.url);
   if(process.env.ACCOUNTING_ENABLED!=='true')throw Error('Agent not enabled');
   await tg('setWebhook',{url,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','edited_message','callback_query'],drop_pending_updates:false,max_connections:1});
   const verified=await tg('getWebhookInfo');return NextResponse.json({connected:verified.url===url,webhook:verified});
  }
  return NextResponse.json({error:'Unknown action'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Operation failed'},{status:503});}
}
