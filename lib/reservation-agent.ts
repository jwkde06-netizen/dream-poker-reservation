export type ReservationStatus='pending'|'confirmed'|'waitlisted'|'rejected'|'cancelled'|'checked_in'|'no_show';
const transitions:Record<string,readonly string[]>={pending:['confirmed','waitlisted','rejected','cancelled'],waitlisted:['confirmed','rejected','cancelled'],confirmed:['waitlisted','checked_in','no_show','cancelled']};
export const canTransition=(from:string,to:string)=>transitions[from]?.includes(to)??false;
export type DeliveryPayload={reservation_id:string;version:number;event:string;status:ReservationStatus;player_name:string;player_name_en?:string|null;player_name_ko?:string|null;arrival_at:string;guest_note?:string;game_title:string;table_no:string;game_no:string};
const statusLabels:Record<ReservationStatus,string>={pending:'Waiting',confirmed:'Confirmed',waitlisted:'Waitlisted',rejected:'Rejected',cancelled:'Cancelled',checked_in:'Checked in',no_show:'No show'};
export function reservationMessage(p:DeliveryPayload){
 const arrival=new Date(p.arrival_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const name=Array.from(new Set([p.player_name_en?.trim(),p.player_name_ko?.trim()].filter(Boolean))).join(' / ')||p.player_name;
 const title=p.event==='requested'?'🔔 NEW RESERVATION':p.status==='confirmed'?'✅ CONFIRMED':'📋 RESERVATION UPDATE';
 const game=p.game_title==='다음 5M 게임'?'Next 5M':p.game_title;
 return [title,`Name: ${name.slice(0,170)}`,`Game: ${game}`,p.table_no?`Table: ${p.table_no}${p.game_no?` · No. ${p.game_no}`:''}`:'',`Arrival: ${arrival} (VN)`,`Status: ${statusLabels[p.status]||p.status}`,p.guest_note?.trim()?`Note: ${p.guest_note.trim().slice(0,500)}`:''].filter(Boolean).join('\n');
}
