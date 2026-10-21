import {createClient} from '@supabase/supabase-js';
import {projectUrl,publicKey,tg} from './telegram';
export function service(){const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('Server connection is not configured');return createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function staff(request:Request){const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!token||!publicKey)return null;const client=createClient(projectUrl,publicKey,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});const {data:{user}}=await client.auth.getUser(token);if(!user)return null;const {data}=await client.from('user_profiles').select('role,active').eq('user_id',user.id).maybeSingle();return data?.active&&['admin','staff'].includes(data.role)?user:null;}
export async function dispatch(){
 const db=service();const destination=await db.rpc('reservation_telegram_target');const chat=String(destination.data||process.env.TELEGRAM_CHAT_ID||'');if(!chat)throw Error('Telegram group is not configured');
 const result=await db.rpc('desk_claim_events');if(result.error)throw Error('Notification queue is not configured');let sent=0,failed=0;
 for(const event of result.data||[]){
  try{
   const {data:g,error:ge}=await db.from('reservation_games').select('title,table_no,game_no,starts_at,capacity,continuing_count').eq('id',event.game_id).single();if(ge)throw ge;
   const b=event.reservation_id?(await db.from('reservations').select('id,player_name,status,desk_kind,hold_owner,agent_code').eq('id',event.reservation_id).single()).data:null;
   const title:Record<string,string>={booking:'새 예약 / Đặt chỗ mới',hold:'좌석 홀드 요청 / Yêu cầu giữ chỗ',replace:'손님 교체 완료 / Đã đổi khách',level4:'레벨 4 · 재참가 확인 / Level 4 · Chơi tiếp',confirm:'승인 완료 / Đã duyệt',confirmed:'승인 완료 / Đã duyệt',reject:'거절 / Từ chối',rejected:'거절 / Từ chối',wait:'대기 / Danh sách chờ',waitlisted:'대기 / Danh sách chờ',cancel:'홀드·예약 해제 / Đã hủy',checkin:'입장 완료 / Đã đến'};
   const text=['◆ DREAM POKER DESK',title[event.action]||event.action,`${g.title} · Table ${g.table_no||'—'} / No.${g.game_no||'—'}`,new Date(g.starts_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),b?`${b.desk_kind==='hold'?'HOLD':'PLAYER'} · ${b.player_name}`:'',b?.agent_code?`Agent · ${b.agent_code}`:'',event.action==='replace'?`${event.detail.from} → ${event.detail.to}`:'',event.action==='level4'?`재참가 / Chơi tiếp: ${event.detail.continuing}\n잔여석 / Còn chỗ: ${event.detail.available}`:'',`Ref: ${event.id.slice(0,8)}`].filter(Boolean).join('\n');
   const buttons=b&&['pending','waitlisted'].includes(b.status)?[[{text:'승인 / Duyệt',callback_data:'reservation:approve:'+b.id},{text:'거절 / Từ chối',callback_data:'reservation:reject:'+b.id}]]:[];
   const root=new URL(process.env.NEXT_PUBLIC_SITE_URL||'https://dream-poker-reservation.vercel.app');root.pathname='/operations';root.search='';
   await tg('sendMessage',{chat_id:chat,text,reply_markup:{inline_keyboard:[...buttons,[{text:'예약 현황 / Xem đặt chỗ',url:root.toString()}]]}});
   const saved=await db.from('desk_events').update({delivered_at:new Date().toISOString(),last_error:null,lease_until:null}).eq('id',event.id);if(saved.error)throw saved.error;sent++;
  }catch{failed++;await db.from('desk_events').update({last_error:'Telegram delivery failed; retry required',lease_until:new Date(Date.now()+60000).toISOString()}).eq('id',event.id)}
 }
 return {sent,failed};
}
