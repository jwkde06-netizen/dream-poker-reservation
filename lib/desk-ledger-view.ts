import {serial,tableLabel,norm} from './accounting-plan';
import type {LedgerSource} from './desk-ledger-plan';
export function ledgerView(s:LedgerSource,day:string){
 const date=serial(day);let game:number|null=null,lastDate:unknown=null;
 const daily=s.daily.flatMap((r,i)=>{
  if(r[1]!==lastDate&&r[1]!=null&&r[1]!==''){game=null;lastDate=r[1];}
  if(r[0]!==''&&r[0]!=null)game=Number.isSafeInteger(Number(r[0]))?Number(r[0]):null;
  if(Number(r[1])!==date||!r[4])return [];
  return [{row:i+1,game,table:tableLabel(r[2]),blind:String(r[3]||''),player:String(r[4]),buyins:r[7]??'',expected:[...Array.from({length:5},(_,j)=>r[j]??''),r[7]??'']}];
 });
 const fnb=s.fnb.flatMap((r,i)=>Number(r[0])===date?[{row:i+1,date:day,floor:r[1],amount:r[2],note:r[3],expected:Array.from({length:4},(_,j)=>r[j]??'')}]:[]);
 return {day,daily,fnb};
}
export function assertReservationOperation(operation:any,reservation:any){
 if(!operation?.reservationId)return;
 if(!reservation||reservation.id!==operation.reservationId||reservation.is_test===true||reservation.status!=='checked_in'||reservation.version!==operation.reservationVersion)
  throw Error('예약 상태가 변경됐거나 입장 완료되지 않았어요. 예약을 새로 확인해주세요.');
 const name=reservation.player_name_en||reservation.player_name;
 if(operation.kind!=='game'||operation.players?.length!==1||!name||norm(operation.players[0].player)!==norm(name))
  throw Error('예약자와 장부 참가자가 일치하지 않아요.');
}
