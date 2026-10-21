import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {requireAdmin,projectUrl,tg} from '../../../../lib/telegram';
import {accountingSheetStatus} from '../../../../lib/accounting-google';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const webhookUrl='https://dream-poker-reservation.vercel.app/api/telegram/webhook';

async function inspect(){
 const required=['TELEGRAM_BOT_TOKEN','SUPABASE_SERVICE_ROLE_KEY','TELEGRAM_WEBHOOK_SECRET','STAFF_TELEGRAM_CHAT_ID','GOOGLE_SERVICE_ACCOUNT_JSON'];
 const missing=required.filter(name=>!process.env[name]);
 const checks:any={missing,inbox_enabled:process.env.STAFF_INBOX_ENABLED==='true',queue_ready:false,group_ready:false,sheets:null,webhook_matches:false,automatic_sheet_writes:false};
 if(process.env.SUPABASE_SERVICE_ROLE_KEY){
  const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
  const {error}=await db.from('staff_message_inbox').select('update_id',{head:true,count:'exact'});
  checks.queue_ready=!error;
 }
 if(process.env.GOOGLE_SERVICE_ACCOUNT_JSON){try{checks.sheets=await accountingSheetStatus()}catch{checks.sheets={accessible:false}}}
 if(process.env.TELEGRAM_BOT_TOKEN){
  try{
   const me=await tg('getMe'),hook=await tg('getWebhookInfo');
   checks.bot_matches=me.username==='dream_poker_reservation_bot';
   checks.webhook_matches=hook.url===webhookUrl;
   checks.other_webhook=Boolean(hook.url&&hook.url!==webhookUrl);
   checks.webhook_error=Boolean(hook.last_error_message);
   if(process.env.STAFF_TELEGRAM_CHAT_ID){
    const member=await tg('getChatMember',{chat_id:process.env.STAFF_TELEGRAM_CHAT_ID,user_id:me.id});
    checks.group_ready=['administrator','creator'].includes(member.status)||(member.status==='member'&&me.can_read_all_group_messages===true);
   }
  }catch{checks.telegram_error=true}
 }
 checks.intake_ready=!missing.length&&checks.inbox_enabled&&checks.queue_ready&&checks.group_ready&&checks.bot_matches;
 return checks;
}
export async function GET(request:Request){
 if(!await requireAdmin(request))return NextResponse.json({error:'Admin login required'},{status:403});
 try{return NextResponse.json(await inspect())}catch{return NextResponse.json({error:'Connection check failed'},{status:503})}
}
export async function POST(request:Request){
 if(!await requireAdmin(request))return NextResponse.json({error:'Admin login required'},{status:403});
 try{
  const checks=await inspect();
  if(!checks.intake_ready||checks.other_webhook)return NextResponse.json({error:'Connection incomplete or another webhook is active',checks},{status:409});
  const secret=process.env.TELEGRAM_WEBHOOK_SECRET!;
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))return NextResponse.json({error:'Webhook secret must be 32–256 URL-safe characters'},{status:409});
  await tg('setWebhook',{url:webhookUrl,secret_token:secret,allowed_updates:['message','edited_message','callback_query'],drop_pending_updates:false});
  const hook=await tg('getWebhookInfo');
  const verified=hook.url===webhookUrl&&['message','edited_message','callback_query'].every(v=>hook.allowed_updates?.includes(v));
  return NextResponse.json({intake_connected:verified,automatic_sheet_writes:false},{status:verified?200:503});
 }catch{return NextResponse.json({error:'Webhook registration failed'},{status:503})}
}
