import {NextResponse} from 'next/server';
import {authorized,handle} from '../../../../lib/accounting-agent';
import {handleReservationCallback} from '../../../../lib/reservation-local-actions';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
export async function POST(request:Request){
 if(!authorized(request,'TELEGRAM_WEBHOOK_SECRET','x-telegram-bot-api-secret-token'))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  if(Number(request.headers.get('content-length'))>1000000)return NextResponse.json({error:'Too large'},{status:413});
  const update=await request.json();
  if(await handleReservationCallback(update))return NextResponse.json({ok:true});
  if(process.env.ACCOUNTING_ENABLED!=='true')return NextResponse.json({error:'Not activated'},{status:503});
  await handle(update);return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Processing requires retry or review'},{status:503});}
}
