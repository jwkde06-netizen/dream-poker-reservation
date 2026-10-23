import {canTransition, reservationActionKeyboard, reservationMessage} from './reservation-agent';

export type DemoRole = 'desk' | 'cashier';
export type DemoStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type DemoDetails = {name:string; game_id:string; arrival_at:string; party_size:number; note:string; note_vi:string};
export type DemoBooking = DemoDetails & {id:string; status:DemoStatus; version:number; created_at:string; updated_at:string; request_kind:'new'|'change'|'cancel'|null; proposed:DemoDetails|null; reply:string; reply_vi:string; alternative_at:string|null; awaiting_desk:boolean};
export type DemoEvent = {id:string; reservation_id:string; action:string; actor:DemoRole; at:string; text:string; details:DemoBooking};
export type DemoState = {games:Array<{id:string;title:string;capacity:number}>; bookings:DemoBooking[]; events:DemoEvent[]};
export type DemoCommand = {id:string; action:'request'|'change'|'cancel_request'|'approve'|'reject'|'suggest'|'cancel'; reservation_id?:string; expected_version?:number; details?:DemoDetails; reply?:string; reply_vi?:string; alternative_at?:string|null};
export type DemoSnapshot = {role:DemoRole; state:DemoState; revision:number; expires_at:string};
export const demoNames = ['DEMO KIM MIN SU','DEMO NGUYEN AN','DEMO LEE JI SU','DEMO TRAN BINH','DEMO PARK JUN'];
export const demoLabels:Record<string,[string,string]> = {
 pending:['요청 중','Chờ duyệt'],confirmed:['확정','Đã xác nhận'],rejected:['거절','Từ chối'],cancelled:['취소','Đã hủy'],
 new:['새 예약 요청','Yêu cầu mới'],change:['변경 요청 중','Chờ đổi đặt chỗ'],cancel:['취소 요청 중','Chờ hủy'],
 request:['예약 요청','Yêu cầu đặt chỗ'],cancel_request:['취소 요청','Yêu cầu hủy'],approve:['승인','Chấp nhận'],reject:['거절','Từ chối'],suggest:['조정 제안','Đề xuất thay đổi']
};
export const demoReasons = [
 {ko:'좌석이 부족합니다.',vi:'Không đủ chỗ.'},
 {ko:'희망 시간에 진행이 어렵습니다.',vi:'Không thể sắp xếp vào giờ mong muốn.'},
 {ko:'아래 대안 시간을 확인해주세요.',vi:'Vui lòng xem giờ đề xuất bên dưới.'},
 {ko:'요청 내용을 다시 확인해주세요.',vi:'Vui lòng kiểm tra lại thông tin yêu cầu.'}
];
export class DemoError extends Error {constructor(public code:string){super(code);}}
export const demoErrors:Record<string,[string,string]> = {
 invalid:['입력 내용을 확인해주세요.','Vui lòng kiểm tra thông tin.'],
 role:['이 역할에서는 처리할 수 없습니다.','Vai trò này không được phép thực hiện.'],
 stale:['다른 직원이 먼저 처리했습니다. 최신 내용을 확인해주세요.','Nhân viên khác đã xử lý. Vui lòng xem thông tin mới nhất.'],
 duplicate:['같은 이름의 진행 중인 예약이 있습니다. 기존 예약을 선택해주세요.','Đã có đặt chỗ cùng tên. Vui lòng chọn đặt chỗ hiện có.'],
 full:['인원수만큼 좌석이 남아 있지 않습니다.','Không còn đủ chỗ cho số khách này.'],
 inactive:['이미 종료된 예약입니다.','Đặt chỗ này đã kết thúc.'],
 reason:['사유 또는 대안 시간을 입력해주세요.','Nhập lý do hoặc giờ thay thế.'],
 limit:['시연 예약 한도에 도달했습니다. 새 시연방을 만들어주세요.','Đã đạt giới hạn. Vui lòng tạo phòng demo mới.'],
 session:['시연 링크가 만료되었거나 올바르지 않습니다.','Liên kết demo đã hết hạn hoặc không hợp lệ.']
};
export const initialDemoState = ():DemoState => ({games:[{id:'dream-5m',title:'Dream Poker 5M',capacity:9}],bookings:[],events:[]});
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max)throw new DemoError('invalid');return v.trim();};
function details(value:DemoDetails|undefined,state:DemoState,now:string):DemoDetails {
 if(!value)throw new DemoError('invalid');
 const name=text(value.name,80),note=text(value.note,500),note_vi=text(value.note_vi,500);
 const time=Date.parse(value.arrival_at);
 if(!demoNames.includes(name)||!state.games.some(g=>g.id===value.game_id)||!Number.isInteger(value.party_size)||value.party_size<1||value.party_size>9||!Number.isFinite(time)||Math.abs(time-Date.parse(now))>7*86400000)throw new DemoError('invalid');
 return {name,note,note_vi,game_id:value.game_id,party_size:value.party_size,arrival_at:new Date(time).toISOString()};
}
export function occupiedSeats(state:DemoState,game:string,except?:string){return state.bookings.filter(b=>b.game_id===game&&b.status==='confirmed'&&b.id!==except).reduce((n,b)=>n+b.party_size,0);}
function unique(state:DemoState,d:DemoDetails,id?:string){if(state.bookings.some(b=>b.id!==id&&['pending','confirmed'].includes(b.status)&&(b.name===d.name&&b.game_id===d.game_id||b.proposed?.name===d.name&&b.proposed?.game_id===d.game_id)))throw new DemoError('duplicate');}

// Both screens, the demo Telegram controls and retries use this single transition function.
// The database commits the entire room with compare-and-swap, so capacity checks serialize.
export function applyDemoCommand(original:DemoState,c:DemoCommand,role:DemoRole,now:string):DemoState {
 if(!c||!/^[-0-9a-f]{36}$/i.test(c.id))throw new DemoError('invalid');
 const allowed=role==='desk'?['request','change','cancel_request']:['approve','reject','suggest','cancel'];
 if(!allowed.includes(c.action))throw new DemoError('role');
 const state:DemoState=structuredClone(original);
 let b:DemoBooking;
 if(c.action==='request'){
  if(state.bookings.length>=60)throw new DemoError('limit');
  const d=details(c.details,state,now);unique(state,d);
  b={...d,id:c.id,status:'pending',version:0,created_at:now,updated_at:now,request_kind:'new',proposed:null,reply:'',reply_vi:'',alternative_at:null,awaiting_desk:false};
  state.bookings.unshift(b);
 }else{
  const found=state.bookings.find(row=>row.id===c.reservation_id);if(!found)throw new DemoError('invalid');b=found;
  if(b.version!==c.expected_version)throw new DemoError('stale');
  if(!['pending','confirmed'].includes(b.status))throw new DemoError('inactive');
  const reply=text(c.reply??'',500),reply_vi=text(c.reply_vi??'',500);
  let alternative:string|null=null;
  if(c.alternative_at){const time=Date.parse(c.alternative_at);if(!Number.isFinite(time)||Math.abs(time-Date.parse(now))>7*86400000)throw new DemoError('invalid');alternative=new Date(time).toISOString();}
  if(c.action==='change'){
   const d=details(c.details,state,now);unique(state,d,b.id);
   b.proposed=d;b.request_kind='change';b.awaiting_desk=false;b.reply='';b.reply_vi='';b.alternative_at=null;
  }else if(c.action==='cancel_request'){
   if(b.request_kind==='cancel')throw new DemoError('stale');
   b.request_kind='cancel';b.proposed=null;b.awaiting_desk=false;b.reply=reply;b.reply_vi=reply_vi;b.alternative_at=null;
  }else if(c.action==='approve'){
   if(!b.request_kind||b.awaiting_desk)throw new DemoError('stale');
   if(b.request_kind==='cancel'){b.status='cancelled';}
   else{
    const d=b.proposed??b;unique(state,d,b.id);
    if(b.status!=='confirmed'&&!canTransition(b.status,'confirmed'))throw new DemoError('inactive');
    const game=state.games.find(g=>g.id===d.game_id)!;
    if(occupiedSeats(state,d.game_id,b.id)+d.party_size>game.capacity)throw new DemoError('full');
    Object.assign(b,{name:d.name,game_id:d.game_id,arrival_at:d.arrival_at,party_size:d.party_size,note:d.note,note_vi:d.note_vi,status:'confirmed'});
   }
   b.request_kind=null;b.proposed=null;b.awaiting_desk=false;b.reply=reply;b.reply_vi=reply_vi;b.alternative_at=null;
  }else if(c.action==='reject'||c.action==='suggest'){
   if(!b.request_kind||b.awaiting_desk)throw new DemoError('stale');
   if(!reply&&!reply_vi&&!alternative)throw new DemoError('reason');
   b.reply=reply;b.reply_vi=reply_vi;b.alternative_at=alternative;
   if(c.action==='suggest'){b.awaiting_desk=true;}
   else {if(b.request_kind==='new')b.status='rejected';b.request_kind=b.status==='pending'?'new':null;b.proposed=null;b.awaiting_desk=false;}
  }else if(c.action==='cancel'){
   if(b.status!=='confirmed'||b.request_kind)throw new DemoError('stale');
   if(!canTransition(b.status,'cancelled'))throw new DemoError('inactive');
   b.status='cancelled';b.reply=reply;b.reply_vi=reply_vi;b.alternative_at=null;b.awaiting_desk=false;
  }
  b.version++;b.updated_at=now;
 }
 if(state.events.length>=400)throw new DemoError('limit');
 state.events.push({id:c.id,reservation_id:b.id,action:c.action,actor:role,at:now,text:b.reply,details:structuredClone(b)});
 return state;
}
export function demoTelegram(b:DemoBooking,state:DemoState){
 const payload={reservation_id:b.id,version:b.version,event:b.version===0?'requested':'updated',status:b.status,player_name:b.name,arrival_at:b.arrival_at,game_title:state.games.find(g=>g.id===b.game_id)?.title||'Dream Poker 5M',table_no:'',game_no:'',guest_note:b.note};
 const extra=[`Guests: ${b.party_size}`,b.request_kind==='change'?'Change requested — cashier review required':b.request_kind==='cancel'?'Cancellation requested — cashier review required':'',b.awaiting_desk?'Desk reply needed':'',b.reply?`Cashier: ${b.reply}`:''];
 return {text:[reservationMessage(payload),...extra.filter(Boolean)].join('\n'),keyboard:reservationActionKeyboard(b.id,payload)};
}
