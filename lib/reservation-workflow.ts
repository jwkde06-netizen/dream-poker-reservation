export type WorkflowBooking={id:string;version:number;status:string;request_kind:string;contact_required?:boolean;alternative_at?:string|null};
export type WorkflowAudit={id:number;reservation_id:string;action?:string;details?:{before?:{request_kind?:string};after?:{version?:number;staff_reply?:string;alternative_at?:string|null}}};
export type ReservationOutcome='changeWaiting'|'cancelWaiting'|'changeDeclined'|'cancelDeclined'|'adjustment'|'contact'|'pending'|'confirmed'|'waitlisted'|'rejected'|'cancelled'|'checked_in'|'no_show';
export function latestReservationAudit(booking:WorkflowBooking,history:WorkflowAudit[]){
 const latest=history.filter(a=>a.reservation_id===booking.id).reduce<WorkflowAudit|undefined>((last,a)=>!last||a.id>last.id?a:last,undefined);
 // Parallel reads can briefly return an audit from an older version.
 return latest?.details?.after?.version===booking.version?latest:undefined;
}
export function reservationOutcome(booking:WorkflowBooking,history:WorkflowAudit[]):ReservationOutcome{
 if(booking.request_kind==='change')return 'changeWaiting';
 if(booking.request_kind==='cancel')return 'cancelWaiting';
 const event=latestReservationAudit(booking,history);
 if(event?.action==='reject'&&event.details?.before?.request_kind==='change')return 'changeDeclined';
 if(event?.action==='reject'&&event.details?.before?.request_kind==='cancel')return 'cancelDeclined';
 if(booking.contact_required)return 'contact';
 if(event?.action==='suggest'||booking.status==='waitlisted'||booking.alternative_at&&booking.status==='confirmed')return 'adjustment';
 return booking.status as ReservationOutcome;
}
export function hasReviewRequest(booking:WorkflowBooking){return booking.status==='pending'||['change','cancel'].includes(booking.request_kind)}
export function reservationMatchesFilter(booking:WorkflowBooking,filter:string,history:WorkflowAudit[]){
 const outcome=reservationOutcome(booking,history);
 if(filter==='all')return true;
 if(filter==='review')return hasReviewRequest(booking);
 if(filter==='active')return ['pending','waitlisted','confirmed'].includes(booking.status);
 if(filter==='arrived')return booking.status==='checked_in';
 if(filter==='adjustment')return ['adjustment','contact'].includes(outcome);
 if(filter==='rejected')return ['rejected','changeDeclined','cancelDeclined'].includes(outcome);
 return booking.status===filter;
}
export function staleReservationDraft(version:number|null,current:WorkflowBooking|undefined){return version!==null&&(!current||current.version!==version)}
