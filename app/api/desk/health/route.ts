import {NextResponse} from 'next/server';
import {staff,service} from '../../../../lib/desk';
import {tg} from '../../../../lib/telegram';
export const dynamic='force-dynamic';
export async function GET(request:Request){if(!await staff(request))return NextResponse.json({error:'Staff login required'},{status:403});try{const db=service();const q=await db.from('desk_events').select('id',{head:true,count:'exact'}).is('delivered_at',null);const hook=await tg('getWebhookInfo');return NextResponse.json({queue_ready:!q.error,pending:q.count,webhook_configured:Boolean(hook.url),approvers_configured:Boolean(process.env.TELEGRAM_APPROVER_IDS),webhook_error:Boolean(hook.last_error_message)})}catch{return NextResponse.json({error:'Connection incomplete'},{status:503})}}
