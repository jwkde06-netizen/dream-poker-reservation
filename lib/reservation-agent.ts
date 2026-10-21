import {createClient} from '@supabase/supabase-js';
import {agentConfig} from './agent-config';
import {projectUrl} from './telegram';
import {parseReservationCommand,reservationError,validateReservationAction,type ReservationAction} from './reservation-domain';

export const RESERVATION_HELP=`예약 데스크 / Quầy đặt chỗ\n/games — 게임·임시 확보 현황\n/hold 게임ID 2 — 데스크 임시 확보 2석 (최대 3)\n/carryover 게임ID 6 — TD 확인: 6명 연속 참가 → 신규 정원 3석\n/replace 임시확보ID 실제이름 | 19:30 — 실명으로 교체, 캐셔 승인 대기\n/book 게임ID 실제이름 | 19:30 — 실제 손님 신청\n/release 임시확보ID — 임시 확보 해제\n\n임시 확보는 LEE DAE JIN / KIM JEE WEON 명의로 별도 표시하며 실제 고객·확정 인원에 포함하지 않습니다. 실제 예약 확정은 캐셔 웹에서 처리합니다.\nGiữ chỗ tạm không phải khách đã xác nhận. Thu ngân duyệt trên web. 시간은 베트남 기준입니다.`;
export function reservationDb(){
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw Error('Reservation storage is not configured');
  return createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function applyReservationAction(action:ReservationAction,actor:string,source:string){
  const {data,error}=await reservationDb().rpc('dream_reservation_apply',{p_action:validateReservationAction(action),p_actor:actor,p_source:source});
  if(error)throw Error(reservationError(error.message));
  if(!data?.ok)throw Error('Reservation outcome could not be verified');
  return data;
}
export async function reservationSnapshot(gameId?:string){
  const {data,error}=await reservationDb().rpc('dream_reservation_snapshot',{p_game_id:gameId||null});
  if(error)throw Error('Reservation desk data is unavailable');
  return (data||[]) as any[];
}
export function formatReservationSnapshot(games:any[]){
  if(!games.length)return '예약 오픈 게임이 없습니다 / Chưa có game mở.';
  return games.map(g=>[
    `Table ${g.table_no} · No.${g.game_no} · ${g.title}`,
    `신규 정원 ${g.capacity} · 실제 확정 ${g.confirmed} · 요청 ${g.pending}`,
    `임시 확보 ${g.held} · 교체 후 승인 대기 ${g.allocated_pending} · 빈 자리 ${g.unheld}`,
    `게임ID ${g.id}`,
    ...(g.holds||[]).filter((h:any)=>h.status==='held').map((h:any)=>`임시 ${h.label} · ${h.id}`),
  ].join('\n')).join('\n\n').slice(0,3900);
}
export function eligibleReservationUpdate(update:any,config=agentConfig('reservations')){
  const m=update?.message;
  if(!config.enabled||!m||update.edited_message||m.from?.is_bot||m.sender_chat||m.via_bot||m.forward_origin||m.forward_date)return false;
  if(String(m.chat?.id)!==config.chatId||!['group','supergroup'].includes(m.chat?.type))return false;
  if(!Number.isSafeInteger(update.update_id)||update.update_id<0||!Number.isSafeInteger(m.message_id)||!Number.isSafeInteger(m.from?.id)||typeof m.text!=='string')return false;
  const addressed=m.text.match(/^\/\w+@(\w+)/),username=(process.env.RESERVATION_TELEGRAM_BOT_USERNAME||'').replace(/^@/,'').toLowerCase();
  if(addressed&&addressed[1].toLowerCase()!==username)return false;
  return true;
}
async function reply(text:string,messageId:number){
  const config=agentConfig('reservations');
  const response=await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text:text.slice(0,3900),reply_parameters:{message_id:messageId,allow_sending_without_reply:true}}),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok||!result.ok)throw Error('Reservation Telegram delivery failed');
}
/** Web-origin changes notify the same configured reservation room after commit. */
export async function notifyReservationChange(result:{message:string;duplicate?:boolean},actor:string){
  const config=agentConfig('reservations');
  if(!config.enabled||!config.token||!config.chatId||result.duplicate)return 'disabled' as const;
  try{
    const response=await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:config.chatId,text:`예약 데스크 / Quầy đặt chỗ\n${result.message}\n담당자 ${actor}`}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();return response.ok&&data.ok?'sent' as const:'failed' as const;
  }catch{return 'failed' as const;}
}
export async function handleReservationUpdate(update:unknown):Promise<{ok:boolean;ignored?:string}>{
  const u=update as any,config=agentConfig('reservations');
  if(!eligibleReservationUpdate(u,config))return {ok:true,ignored:'outside_reservation_scope'};
  const m=u.message;
  let action:ReturnType<typeof parseReservationCommand>;
  try{action=parseReservationCommand(m.text,new Date(Number(m.date||Math.floor(Date.now()/1000))*1000));}catch(error){await reply(error instanceof Error?error.message:'명령을 확인해주세요.',m.message_id);return {ok:true};}
  if(!action)return {ok:true,ignored:'not_a_reservation_command'};
  if(action==='help'){await reply(RESERVATION_HELP,m.message_id);return {ok:true};}
  if(action==='games'){await reply(formatReservationSnapshot(await reservationSnapshot()),m.message_id);return {ok:true};}
  if(!config.administrators.includes(String(m.from.id))){await reply('등록된 예약 담당자만 변경할 수 있습니다 / Chỉ nhân viên được chỉ định có quyền thay đổi.',m.message_id);return {ok:true,ignored:'unauthorized_actor'};}
  const botId=config.token.split(':')[0],source=`telegram:${botId}:${u.update_id}`;
  try{
    const result=await applyReservationAction(action,`telegram:${m.from.id}`,source);
    if(!result.duplicate)await reply(`${result.message}\n담당자 Telegram ${m.from.id}\n기록 ${source}`,m.message_id);
  }catch(error){await reply(error instanceof Error?error.message:'예약 처리 실패. 현황을 확인해주세요.',m.message_id);}
  return {ok:true};
}
