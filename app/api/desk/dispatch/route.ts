import {NextResponse} from 'next/server';
import {dispatch,staff} from '../../../../lib/desk';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!await staff(request))return NextResponse.json({error:'Staff login required'},{status:403});try{return NextResponse.json(await dispatch())}catch{return NextResponse.json({error:'Notification connection unavailable'},{status:503})}}
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get('authorization')!=='Bearer '+secret)return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await dispatch())}catch{return NextResponse.json({error:'Notification connection unavailable'},{status:503})}}
