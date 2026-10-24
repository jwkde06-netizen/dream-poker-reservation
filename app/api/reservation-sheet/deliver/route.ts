import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl} from '../../../../lib/telegram';
import {syncReservationSheet} from '../../../../lib/reservation-sheet';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request){
 const body=await request.json().catch(()=>null);
 if(!/^[0-9a-f-]{36}$/i.test(body?.token||''))return NextResponse.json({error:'Invalid dispatch'},{status:400});
 const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const claim=await db.rpc('claim_reservation_sheet',{p_token:body.token});
 if(claim.error)return NextResponse.json({error:'Sync unavailable'},{status:503});
 if(!claim.data)return NextResponse.json({accepted:false});
 const {lease_id,revision,rows}=claim.data;
 try{
  const result=await syncReservationSheet(rows);
  const finished=await db.rpc('finish_reservation_sheet',{p_lease:lease_id,p_revision:revision,p_error:null});
  if(finished.error||!finished.data)return NextResponse.json({error:'Sync receipt not saved; retry queued'},{status:503});
  return NextResponse.json({ok:true,...result});
 }catch(e){
  await db.rpc('finish_reservation_sheet',{p_lease:lease_id,p_revision:revision,p_error:(e as Error).message});
  return NextResponse.json({error:'Reservation sheet sync failed; retry queued'},{status:503});
 }
}
