import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl,publicKey} from '../../../../lib/telegram';
import {readReceiptLedger,receiptEvidence,receiptEvidenceCode,type ReservationSheetRow} from '../../../../lib/reservation-sheet';
export const runtime='nodejs';
export const maxDuration=45;
export async function GET(request:Request){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token)return NextResponse.json({error:'Staff login required'},{status:401});
 const db=createClient(projectUrl,publicKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user}}=await db.auth.getUser(token);
 if(!user)return NextResponse.json({error:'Staff login required'},{status:401});
 const {data:role}=await db.rpc('current_app_role');
 if(!['admin','staff','desk','cashier'].includes(role))return NextResponse.json({error:'Staff access required'},{status:403});
 const id=new URL(request.url).searchParams.get('id');
 if(!/^[0-9a-f-]{36}$/i.test(id||''))return NextResponse.json({error:'Invalid reservation'},{status:400});
 const {data:r,error}=await db.from('reservations').select('id,player_name,party_size,game:reservation_games(title,starts_at,table_no,game_no,is_default_queue)').eq('id',id).eq('is_test',false).maybeSingle();
 if(error||!r)return NextResponse.json({error:'Reservation not found'},{status:404});
 try{
  const game=(Array.isArray(r.game)?r.game[0]:r.game) as Record<string,unknown>;
  const row={...r,...game} as unknown as ReservationSheetRow,ledger=await readReceiptLedger();
  return NextResponse.json({code:receiptEvidenceCode(row,ledger),message:receiptEvidence(row,ledger),financial_write:false,attendance_changed:false},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Could not read receipt ledger; no changes made'},{status:503})}
}
