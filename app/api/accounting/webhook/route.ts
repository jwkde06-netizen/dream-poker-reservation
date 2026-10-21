import {NextResponse} from 'next/server';
import {handle} from '../../../../lib/accounting-agent';
import {accountingIdentity,accountingWebhookAuthorized} from '../../../../lib/accounting-telegram';
import {agentConfig} from '../../../../lib/agent-config';
import {handleReservationUpdate} from '../../../../lib/reservation-agent';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
export async function POST(request:Request){
 if(!accountingWebhookAuthorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  if(Number(request.headers.get('content-length'))>1000000)return NextResponse.json({error:'Too large'},{status:413});
  const update=await request.json();
  const identity=accountingIdentity(),reservation=agentConfig('reservations');
  // The original bot has one Telegram webhook. During the explicit legacy
  // transition it can serve the reservation room even if accounting is paused.
  // A dedicated accounting credential must never authorize that delegation.
  if(identity.mode==='legacy'&&String((update.message||update.edited_message)?.chat?.id)===reservation.chatId){
   if(!reservation.enabled)return NextResponse.json({ok:true,ignored:'reservations_disabled'});
   return NextResponse.json(await handleReservationUpdate(update));
  }
  if(process.env.ACCOUNTING_ENABLED!=='true')return NextResponse.json({error:'Not activated'},{status:503});
  await handle(update);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:'Processing requires retry or review'},{status:503});}
}
