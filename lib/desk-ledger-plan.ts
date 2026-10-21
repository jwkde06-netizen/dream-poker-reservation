import {createHash} from 'node:crypto';
import {planOperations,serial,norm,CellChange} from './accounting-plan';
export type LedgerSource={daily:any[][];fnb:any[][];master:any[][];menu:any[][]};
export const sourceHash=(s:LedgerSource)=>createHash('sha256').update(JSON.stringify({daily:s.daily.map(r=>[...r.slice(0,5),r[7]??'']),fnb:s.fnb,master:s.master,menu:s.menu})).digest('hex');
const txt=(v:any,max=500)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('입력 내용을 확인해주세요.');return v.trim();};
const integer=(v:any,min:number,max:number)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error('숫자 범위를 확인해주세요.');return v;};
const pad=(r:any[],n:number)=>Array.from({length:n},(_,i)=>r[i]??'');
export function deskPlan(b:any,s:LedgerSource){
 let changes:CellChange[]=[],summary:string[]=[];
 const codes=Array.from(new Set(s.master.slice(1).map(r=>String(r[2]||'').trim()).filter(Boolean)));
 if(b.kind==='game'){
  serial(b.date);integer(b.game,1,100);integer(b.table,1,100);
  if(!['3M','5M','10M','15M'].includes(b.blind)||!Array.isArray(b.players)||!b.players.length||b.players.length>20)throw Error('게임과 참가자를 확인해주세요.');
  const seen=new Set();const ops=b.players.map((p:any)=>{const player=txt(p.player,80),key=norm(player);if(seen.has(key))throw Error('같은 선수가 두 번 선택됐어요.');seen.add(key);return {kind:'add',date:b.date,game:b.game,table:b.table,blind:b.blind,player,buyins:integer(p.buyins,1,50)};});
  const p=planOperations(ops,s.daily,s.fnb,s.master,{tableRoundLabels:true});changes=p.changes;summary=p.summary;
 }else if(b.kind==='buyins'||b.kind==='cancel'){
  const row=integer(b.row,2,s.daily.length),r=s.daily[row-1];if(!r?.[4])throw Error('선수 기록이 없어요. 새로고침해주세요.');if(JSON.stringify(b.expected)!==JSON.stringify([...pad(r,5),r[7]??'']))throw Error('선수 기록이 변경됐어요. 새로고침해주세요.');
  if(b.kind==='buyins'){const count=integer(b.buyins,1,50);if(count<Number(r[7]))txt(b.reason,200);changes=[{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[[count]]}];summary=[`${r[4]} · ${r[2]} 테이블 · 총 ${r[7]} → ${count}바인`,...(b.reason?[String(b.reason)]:[])];}
  else{txt(b.reason,200);if(r[0]&&s.daily[row]?.[4]&&!s.daily[row]?.[0]&&s.daily[row]?.[1]===r[1])changes.push({range:`'일일 입력'!A${row+1}`,before:[['']],values:[[r[0]]]});changes.push({range:`'일일 입력'!A${row}:E${row}`,before:[pad(r,5)],values:[['','','','','']]},{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[['']]});summary=[`${r[4]} · ${r[2]} 테이블 참가 취소`,b.reason];}
 }else if(b.kind==='fnb'||b.kind==='fnb_edit'){
  serial(b.date);if(!['2F','3F','4F'].includes(b.floor))throw Error('층을 확인해주세요.');
  const note=txt(b.note),amount=integer(b.amount,1,100000000);
  if(b.kind==='fnb'){const p=planOperations([{kind:'fnb',date:b.date,floor:b.floor,amount,note}],s.daily,s.fnb,s.master);changes=p.changes;summary=p.summary;}
  else{const row=integer(b.row,2,s.fnb.length),r=s.fnb[row-1];if(!r?.[0])throw Error('기록을 다시 확인해주세요.');if(JSON.stringify(b.expected)!==JSON.stringify(pad(r,4)))throw Error('F&B 기록이 변경됐어요. 새로고침해주세요.');changes=[{range:`'F&B 입력'!A${row}:D${row}`,before:[pad(r,4)],values:[[serial(b.date),b.floor,amount,note]]}];summary=[`${b.floor} ${note} · ${amount.toLocaleString()}동으로 수정`];}
 }else if(b.kind==='register'){
  const player=txt(b.player,80).toUpperCase(),agency=txt(b.agency,40);if(!codes.includes(agency))throw Error('등록된 소속 코드를 선택해주세요.');const card=typeof b.card==='string'?b.card.trim():'';
  const p=planOperations([{kind:'register',player,agency,card}],s.daily,s.fnb,s.master,{registrationApprovals:{[norm(player)]:{agency,card}}});changes=p.changes;summary=p.summary;
 }else throw Error('지원하지 않는 작업입니다.');
 changes=changes.filter(c=>JSON.stringify(c.before)!==JSON.stringify(c.values));
 return {changes,summary};
}
