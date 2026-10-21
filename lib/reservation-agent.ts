import {bookingName} from "./reservation-names";
export type ReservationStatus='pending'|'confirmed'|'waitlisted'|'rejected'|'cancelled'|'checked_in'|'no_show';
const transitions:Record<string,readonly string[]>={pending:['confirmed','waitlisted','rejected','cancelled'],waitlisted:['confirmed','rejected','cancelled'],confirmed:['waitlisted','checked_in','no_show','cancelled']};
export const canTransition=(from:string,to:string)=>transitions[from]?.includes(to)??false;
export type DeliveryPayload={reservation_id:string;version:number;event:string;status:ReservationStatus;player_name:string;player_name_en?:string|null;player_name_ko?:string|null;arrival_at:string;guest_note?:string;game_title:string;table_no:string;game_no:string};
const statusLabels:Record<ReservationStatus,string>={pending:'승인 대기 / Pending / Chờ duyệt',confirmed:'예약 확정 / Confirmed / Đã xác nhận',waitlisted:'대기 등록 / Waitlisted / Danh sách chờ',rejected:'거절 / Rejected / Từ chối',cancelled:'취소 / Cancelled / Đã hủy',checked_in:'입장 완료 / Checked in / Đã đến',no_show:'노쇼 / No show / Không đến'};
export function reservationMessage(p:DeliveryPayload){
 const arrival=new Date(p.arrival_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 return [p.event==='requested'?'🔔 새 예약 / NEW BOOKING / ĐẶT CHỖ MỚI':'📋 예약 변경 / BOOKING UPDATE',`${p.game_title} · Table ${p.table_no||'—'} / No.${p.game_no||'—'}`,`👤 ${bookingName(p).slice(0,170)}`,`🕒 ${arrival} (Vietnam)`,`📌 ${statusLabels[p.status]||p.status}`,p.guest_note?`📝 ${p.guest_note.slice(0,500)}`:'',p.status==='pending'?'한국인 데스크 또는 캐셔 확인 필요 / Desk or cashier approval required':'',`#${p.reservation_id.slice(0,8)} · v${p.version}`].filter(Boolean).join('\n');
}
