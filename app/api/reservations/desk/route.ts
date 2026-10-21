import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl,publicKey} from '../../../../lib/telegram';
import {applyReservationAction,notifyReservationChange,reservationDb,reservationSnapshot} from '../../../../lib/reservation-agent';
import {isReservationId,validateReservationAction} from '../../../../lib/reservation-domain';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function staff(request:Request){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token||!publicKey)return null;
  const client=createClient(projectUrl,publicKey,{auth:{persistSession:false}});
  const {data:{user},error}=await client.auth.getUser(token);if(error||!user)return null;
  const {data:profile,error:profileError}=await reservationDb().from('user_profiles').select('role,active').eq('user_id',user.id).maybeSingle();
  if(profileError||!profile?.active||!['admin','staff','cashier','desk'].includes(profile.role))return null;
  return {id:user.id,role:String(profile.role)};
}
export async function GET(request:Request){
  try{if(!await staff(request))return NextResponse.json({error:'Staff access required'},{status:403});
    const gameId=new URL(request.url).searchParams.get('game_id')||undefined;
    if(gameId&&!isReservationId(gameId))return NextResponse.json({error:'Invalid game ID'},{status:400});
    return NextResponse.json({games:await reservationSnapshot(gameId)});
  }catch{return NextResponse.json({error:'예약 데스크 연결을 확인해주세요 / Kiểm tra kết nối quầy.'},{status:503});}
}
export async function POST(request:Request){
  try{const actor=await staff(request);if(!actor)return NextResponse.json({error:'Staff access required'},{status:403});
    const body=await request.json();const action=validateReservationAction(body.action);
    if(['carryover','assign'].includes(action.kind)&&actor.role==='desk')return NextResponse.json({error:'Cashier or TD approval required'},{status:403});
    if(typeof body.request_id!=='string'||!isReservationId(body.request_id))return NextResponse.json({error:'Request ID required'},{status:400});
    const result=await applyReservationAction(action,`staff:${actor.id}`,`web:${actor.id}:${body.request_id}`);
    const notification=await notifyReservationChange(result,`staff:${actor.id}`);
    return NextResponse.json({...result,notification});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Reservation update failed'},{status:409});}
}
