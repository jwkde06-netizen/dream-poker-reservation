import {NextResponse} from 'next/server';
import {authorized,handle} from '../../../../lib/accounting-agent';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
export async function POST(request:Request){
 if(!authorized(request,'TELEGRAM_WEBHOOK_SECRET','x-telegram-bot-api-secret-token'))return NextResponse.json({error:'Unauthorized'},{status:401});
 if(process.env.ACCOUNTING_ENABLED!=='true')return NextResponse.json({error:'Not activated'},{status:503});
 try{if(Number(request.headers.get('content-length'))>1000000)return NextResponse.json({error:'Too large'},{status:413});await handle(await request.json());return NextResponse.json({ok:true});}catch{return NextResponse.json({error:'Processing requires retry or review'},{status:503});}
}
