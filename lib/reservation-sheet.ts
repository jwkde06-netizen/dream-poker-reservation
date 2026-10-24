import {accessToken,accountingWorkbook} from './accounting-google';

export const reservationSheetName='예약 현황';
export const reservationHeaders=['예약 ID','접수 일시 (VN)','이름 · Tên','게임 · Trò chơi','테이블','게임 No.','도착 예정 (VN)','인원','예약 상태','변경·취소 요청','영수증 기록 대조','방문 확인','접수 경로','메모','캐셔 답변','대안 시간 (VN)','최근 처리자','처리 일시 (VN)'];
export type ReservationSheetRow={id:string;created_at:string;player_name:string;party_size:number;arrival_at:string;status:string;request_kind:string;source:string;guest_note:string;staff_reply:string;alternative_at?:string;updated_actor:string;updated_at:string;game_title:string;game_no:string;table_no:string;starts_at:string;is_default_queue:boolean};
const statuses:Record<string,string>={pending:'요청 중 / Chờ duyệt',confirmed:'확정 / Đã xác nhận',waitlisted:'조정 대기 / Chờ điều chỉnh',rejected:'거절 / Từ chối',cancelled:'취소 / Đã hủy',checked_in:'도착 확인 / Đã đến',no_show:'미방문 확인 / Không đến'};
const date=(s:string)=>new Date(Date.parse(s)+7*3600000).toISOString().slice(0,10);
const stamp=(s?:string)=>s?new Date(Date.parse(s)+7*3600000).toISOString().slice(0,16).replace('T',' '):'';
const normalize=(s:unknown)=>String(s??'').trim().replace(/\s+/g,' ').toUpperCase();
function sheetDate(v:unknown){if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);return String(v||'').trim().replace(/[./]/g,'-').slice(0,10)}

// A match is only a receipt-ledger hint. It never changes attendance or financial data.
export function receiptEvidenceCode(r:ReservationSheetRow,ledger:unknown[][]){
 if(r.is_default_queue||!r.game_no||!r.table_no)return 'unassigned';
 const candidates=ledger.filter(row=>normalize(row[4])===normalize(r.player_name)&&normalize(row[0])===normalize(r.game_no)&&normalize(row[2])===normalize(r.table_no)&&sheetDate(row[1])===date(r.starts_at));
 if(candidates.length>1)return 'multiple';
 if(candidates.length===1&&Number(candidates[0][7])>0)return r.party_size>1?'group':'matched';
 return 'none';
}
export function receiptEvidence(r:ReservationSheetRow,ledger:unknown[][]){
 return {unassigned:'게임 배정 후 대조 · Cần xếp bàn/game',multiple:'복수 기록 · 직원 확인 필요 / Nhiều bản ghi, cần kiểm tra',group:'대표자 정산 기록 있음 · 일행 별도 확인 / Có biên lai đại diện',matched:'동일 이름·게임 정산 기록 있음 · 참가 확인 필요 / Có bản ghi, cần xác minh',none:'일치 기록 없음 · 미방문 판정 아님 / Chưa khớp, không tự kết luận'}[receiptEvidenceCode(r,ledger)];
}
export function reservationSheetValues(rows:ReservationSheetRow[],ledger:unknown[][]){
 return [reservationHeaders,...rows.map(r=>[r.id,stamp(r.created_at),r.player_name,r.game_title,r.table_no,r.game_no,stamp(r.arrival_at),r.party_size,statuses[r.status]||r.status,
 {new:'신규 요청',change:'변경 승인 대기',cancel:'취소 승인 대기',none:''}[r.request_kind]||'',receiptEvidence(r,ledger),
 r.status==='checked_in'?'직원 도착 확인 / Đã đến':r.status==='no_show'?'직원 미방문 확인 / Không đến':'방문 미확인 / Chưa xác minh',
 r.source==='desk'?'데스크 직접 입력 / Quầy':'손님 신청 / Khách',r.guest_note,r.staff_reply,stamp(r.alternative_at),r.updated_actor,stamp(r.updated_at)])];
}
async function sheets(path:string,init:RequestInit={}){
 const response=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${accountingWorkbook}${path}`,{...init,headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!response.ok)throw Error('Reservation sheet connection failed ('+response.status+')');
 return response.json();
}
export async function readReceiptLedger(){
 const metadata=await sheets('?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))');
 const daily=metadata.sheets?.find((s:any)=>s.properties?.title==='일일 입력');
 const count=daily?.properties?.gridProperties?.rowCount;
 if(!Number.isInteger(count)||count<2||count>50000)throw Error('Receipt ledger dimensions require review');
 const result=await sheets('/values/'+encodeURIComponent("'일일 입력'!A1:I"+count)+'?valueRenderOption=UNFORMATTED_VALUE');
 const rows=result.values||[];
 const expected=['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN'];
 if(!expected.every((h,i)=>rows[0]?.[i]===h))throw Error('Receipt ledger headers changed; no matching performed');
 return rows.slice(1) as unknown[][];
}
export async function syncReservationSheet(rows:ReservationSheetRow[]){
 if(rows.length>9999)throw Error('Reservation export exceeds sheet size; expand before retrying');
 const values=reservationSheetValues(rows,await readReceiptLedger());
 const range=`'${reservationSheetName}'!A1:R${values.length}`;
 // Verify the fixed destination before any write. RAW prevents note/name formula injection.
 const current=await sheets('/values/'+encodeURIComponent(`'${reservationSheetName}'!A1:R1`));
 if(!reservationHeaders.every((h,i)=>current.values?.[0]?.[i]===h))throw Error('Reservation sheet header mismatch; no changes written');
 await sheets('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({range,majorDimension:'ROWS',values})});
 const readback=await sheets('/values/'+encodeURIComponent(range)+'?valueRenderOption=UNFORMATTED_VALUE');
 const actual=readback.values||[];
 if(values.some((row,i)=>row.some((value,j)=>String(value??'')!==String(actual[i]?.[j]??''))))throw Error('Reservation sheet readback did not match; retry queued');
 return {rows:rows.length};
}
