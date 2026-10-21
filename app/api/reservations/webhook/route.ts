import {NextResponse} from 'next/server';
import {agentConfig,secureEqual} from '../../../../lib/agent-config';
import {handleReservationUpdate} from '../../../../lib/reservation-agent';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
  const config=agentConfig('reservations');
  if(!secureEqual(request.headers.get('x-telegram-bot-api-secret-token')||'',config.secret))return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!config.enabled)return NextResponse.json({error:'Not activated'},{status:503});
  if(Number(request.headers.get('content-length'))>1000000)return NextResponse.json({error:'Too large'},{status:413});
  try{return NextResponse.json(await handleReservationUpdate(await request.json()));}catch{return NextResponse.json({error:'Reservation processing unavailable'},{status:503});}
}
