export type ReservationStatus='pending'|'confirmed'|'waitlisted'|'rejected'|'cancelled'|'checked_in'|'no_show';
const transitions:Record<string,readonly string[]>={pending:['confirmed','waitlisted','rejected','cancelled'],waitlisted:['confirmed','rejected','cancelled'],confirmed:['waitlisted','checked_in','no_show','cancelled']};
export const canTransition=(from:string,to:string)=>transitions[from]?.includes(to)??false;
export type DeliveryPayload={reservation_id:string;version:number;event:string;status:ReservationStatus;contact_required?:boolean;player_name:string;player_name_en?:string|null;player_name_ko?:string|null;arrival_at:string;guest_note?:string;game_title:string;table_no:string;game_no:string;party_size?:number;request_kind?:string;proposed_game?:string;proposed?:{player_name_en?:string;party_size?:number;arrival_at?:string;guest_note?:string;game_id?:string;reason?:string};staff_reply?:string;alternative_at?:string};
const statusLabels:Record<ReservationStatus,string>={pending:'Waiting',confirmed:'Confirmed',waitlisted:'Waitlisted',rejected:'Rejected',cancelled:'Cancelled',checked_in:'Checked in',no_show:'No show'};
export function reservationMessage(p:DeliveryPayload){
 const arrival=new Date(p.arrival_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
 const name=Array.from(new Set([p.player_name_en?.trim(),p.player_name_ko?.trim()].filter(Boolean))).join(' / ')||p.player_name;
 const title=p.contact_required?'📞 CONTACT DESK':p.request_kind==='change'?'📝 CHANGE REQUEST':p.request_kind==='cancel'?'📝 CANCEL REQUEST':p.event==='requested'?'🔔 NEW RESERVATION':p.status==='confirmed'?'✅ CONFIRMED':'📋 RESERVATION UPDATE';
 const game=p.game_title==='다음 5M 게임'?'Next 5M':p.game_title;
 const proposed=p.request_kind==='change'&&p.proposed?`Requested: ${p.proposed.player_name_en||name} · ${p.proposed.party_size||p.party_size||1} guests\nGame: ${p.proposed_game||game}\nArrival: ${p.proposed.arrival_at?new Date(p.proposed.arrival_at).toLocaleString('en-GB',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):arrival} (VN)${p.proposed.guest_note?'\nNote: '+p.proposed.guest_note:''}\nCurrent booking stays until approved.`:'';
 return [title,`Name: ${name.slice(0,170)}`,`Game: ${game}`,p.table_no?`Table: ${p.table_no}${p.game_no?` · No. ${p.game_no}`:''}`:'',`Arrival: ${arrival} (VN)`,`Guests: ${p.party_size||1}`,`Status: ${p.contact_required?'Contact desk':statusLabels[p.status]||p.status}`,proposed,p.request_kind==='cancel'?'Cancellation awaiting approval.':'',p.contact_required?'Please contact the Korean desk on KakaoTalk.':'',p.guest_note?.trim()?`Note: ${p.guest_note.trim().slice(0,500)}`:'',p.staff_reply?`Reply: ${p.staff_reply}`:''].filter(Boolean).join('\n');
}

export function reservationActionKeyboard(deliveryId:string,p:Pick<DeliveryPayload,'status'|'contact_required'|'request_kind'>){
 const active=['pending','waitlisted','confirmed'].includes(p.status);
 return {inline_keyboard:active?[[
  {text:p.request_kind==='cancel'?'APPROVE CANCEL':p.status==='confirmed'&&p.request_kind!=='change'?'CANCEL':'CONFIRM',callback_data:`rr:${p.status==='confirmed'&&!['change','cancel'].includes(p.request_kind||'')?'cancel':'confirm'}:${deliveryId}`},
  {text:p.contact_required?'CONTACT DESK ✓':'CONTACT DESK',callback_data:`rr:contact:${deliveryId}`}
 ]]:[]};
}
