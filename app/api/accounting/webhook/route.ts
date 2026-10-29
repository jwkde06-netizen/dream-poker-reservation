import {handleManagementRoom} from '../../../../lib/accounting-management-room';
import {handleReportRoom} from '../../../../lib/accounting-report';
import {NextResponse} from 'next/server';
import {authorized,handle} from '../../../../lib/accounting-agent';
import {handleReservationCallback} from '../../../../lib/reservation-local-actions';
import {handlePublicReservationCallback} from '../../../../lib/reservation-telegram-actions';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
export async function POST(request:Request){
 if(!authorized(request,'TELEGRAM_WEBHOOK_SECRET','x-telegram-bot-api-secret-token'))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  if(Number(request.headers.get('content-length'))>1000000)return NextResponse.json({error:'Too large'},{status:413});
  const update=await request.json();
  if(await handlePublicReservationCallback(update))return NextResponse.json({ok:true});
  if(await handleReservationCallback(update))return NextResponse.json({ok:true});
  if(process.env.ACCOUNTING_ENABLED!=='true')return NextResponse.json({error:'Not activated'},{status:503});
  if(await handleManagementRoom(update))return NextResponse.json({ok:true});
  if(await handleReportRoom(update))return NextResponse.json({ok:true});
  await handle(update);return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Processing requires retry or review'},{status:503});}
}
