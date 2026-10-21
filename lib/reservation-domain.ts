export const DESK_HOLD_NAMES = ['LEE DAE JIN', 'KIM JEE WEON'] as const;
export type ReservationAction =
  | {kind:'holds'; game_id:string; count:number}
  | {kind:'carryover'; game_id:string; count:number}
  | {kind:'replace'; hold_id:string; name:string; arrival_at:string}
  | {kind:'release'; hold_id:string}
  | {kind:'book'; game_id:string; name:string; arrival_at:string}
  | {kind:'assign'; reservation_id:string; game_id:string};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isReservationId=(value:unknown):value is string=>typeof value==='string'&&UUID.test(value);
export function validateReservationAction(value:unknown):ReservationAction {
  if(!value||typeof value!=='object')throw Error('Invalid reservation action');
  const v=value as Record<string,unknown>,kind=v.kind;
  if(!['holds','carryover','replace','release','book','assign'].includes(String(kind)))throw Error('Unknown reservation action');
  if(['holds','carryover','book','assign'].includes(String(kind))&&!isReservationId(v.game_id))throw Error('게임 ID를 확인해주세요 / Kiểm tra mã game');
  if(['replace','release'].includes(String(kind))&&!isReservationId(v.hold_id))throw Error('임시 확보 ID를 확인해주세요 / Kiểm tra mã giữ chỗ');
  if(kind==='assign'&&!isReservationId(v.reservation_id))throw Error('Invalid reservation ID');
  if(kind==='holds'||kind==='carryover') {
    if(!Number.isInteger(v.count)||Number(v.count)<0||Number(v.count)>(kind==='holds'?3:9))throw Error('인원수를 확인해주세요 / Kiểm tra số lượng');
  }
  if(kind==='book'||kind==='replace') {
    if(typeof v.name!=='string'||v.name.trim().length<2||v.name.trim().length>80||/[\r\n\x00-\x1f]/.test(v.name))throw Error('실제 손님 이름을 입력해주세요 / Nhập tên khách thật');
    if(DESK_HOLD_NAMES.some(n=>n===String(v.name).trim().toUpperCase()))throw Error('데스크 명의는 임시 확보로 등록하세요 / Dùng chức năng giữ chỗ tạm');
    if(typeof v.arrival_at!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(v.arrival_at)||!Number.isFinite(Date.parse(v.arrival_at)))throw Error('베트남 도착 시간을 입력해주세요 / Nhập giờ đến');
    return {...v,name:v.name.trim()} as ReservationAction;
  }
  return v as ReservationAction;
}
/** Existing capacity is already the number of NEW seats, not the physical nine seats. */
export function reservationCapacity(capacity:number,confirmed:number,held:number,allocatedPending:number) {
  for(const n of [capacity,confirmed,held,allocatedPending])if(!Number.isInteger(n)||n<0)throw Error('Invalid seat count');
  const occupied=confirmed+held+allocatedPending;
  return {newSeatCapacity:capacity,returning:Math.max(0,9-capacity),confirmed,held,allocatedPending,unheld:Math.max(0,capacity-occupied),replaceable:held,overCapacity:occupied>capacity};
}
export function parseReservationCommand(text:string,now:Date=new Date()):ReservationAction|'games'|'help'|null {
  const input=text.trim().replace(/^\/(\w+)@[A-Za-z0-9_]+/,'/$1');
  if(/^(\/games|예약\s*현황|현황)$/i.test(input))return 'games';
  if(/^(\/help|\/start|도움말)$/i.test(input))return 'help';
  let m=input.match(/^\/(hold|carryover)\s+(\S+)\s+(\d+)$/i);
  if(m)return validateReservationAction({kind:m[1].toLowerCase()==='hold'?'holds':'carryover',game_id:m[2],count:Number(m[3])});
  m=input.match(/^\/release\s+(\S+)$/i);if(m)return validateReservationAction({kind:'release',hold_id:m[1]});
  m=input.match(/^\/(book|replace)\s+(\S+)\s+([^|]+)\|\s*(\d{2}:\d{2})$/i);
  if(m){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(m[4]))throw Error('시간 형식은 HH:MM 입니다 / Giờ HH:MM');
    const date=new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
    let arrival=new Date(`${date}T${m[4]}:00+07:00`);
    if(arrival.getTime()<now.getTime()-6*3600000)arrival=new Date(arrival.getTime()+86400000);
    return validateReservationAction({kind:m[1].toLowerCase(),[m[1].toLowerCase()==='book'?'game_id':'hold_id']:m[2],name:m[3].trim(),arrival_at:arrival.toISOString()});
  }
  return null;
}
export function reservationError(message:string) {
  if(message.includes('reservation_capacity'))return '남은 자리가 부족합니다. 최신 현황을 확인해주세요 / Không đủ chỗ, vui lòng làm mới.';
  if(message.includes('reservation_hold_stale'))return '이미 교체되거나 해제된 임시 확보입니다 / Chỗ tạm đã được xử lý.';
  if(message.includes('reservation_duplicate_player'))return '같은 이름의 진행 중인 예약이 있습니다. 기존 예약을 확인해주세요 / Khách này đã có đặt chỗ.';
  if(message.includes('reservation_real_queue'))return '실제 손님 요청이 있어 임시 확보를 추가하지 않았습니다 / Đã có yêu cầu của khách thật.';
  if(message.includes('reservation_game_closed'))return '예약이 닫힌 게임입니다 / Game đã đóng đặt chỗ.';
  return message.startsWith('reservation_')?'예약 상태가 변경되었습니다. 새로고침 후 확인해주세요 / Trạng thái đã thay đổi.':message;
}
