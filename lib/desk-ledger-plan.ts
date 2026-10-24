import {createHash} from 'node:crypto';
import {planOperations,serial,norm,tableLabel,CellChange} from './accounting-plan';
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
 }else if(b.kind==='buyins'||b.kind==='cancel'||b.kind==='participant'){
  const row=integer(b.row,2,s.daily.length),r=s.daily[row-1];if(!r?.[4])throw Error('선수 기록이 없어요. 새로고침해주세요.');if(JSON.stringify(b.expected)!==JSON.stringify([...pad(r,5),r[7]??'']))throw Error('선수 기록이 변경됐어요. 새로고침해주세요.');
  if(b.kind==='buyins'){const count=integer(b.buyins,1,50);if(count<Number(r[7]))txt(b.reason,200);changes=[{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[[count]]}];summary=[`${r[4]} · ${r[2]} 테이블 · 총 ${r[7]} → ${count}바인`,...(b.reason?[String(b.reason)]:[])];}
  else{
   txt(b.reason,200);
   let start=row-1;while(start>1&&!s.daily[start][0])start--;
   const game=Number(s.daily[start][0]);if(!Number.isSafeInteger(game)||game<1)throw Error('게임 번호를 확인해주세요.');
   let end=start+1;while(end<s.daily.length&&!s.daily[end][0])end++;
   if(b.kind==='participant'){
    const target=txt(b.player,80),matches=s.master.slice(1).filter(m=>norm(m[0])===norm(target));
    if(matches.length!==1||!String(matches[0][2]||'').trim())throw Error('등록된 선수와 소속 코드를 확인해주세요.');
    const name=String(matches[0][0]),count=integer(b.buyins,1,50);
    if(s.daily.slice(start,end).some((entry,i)=>start+i!==row-1&&norm(entry[4])===norm(name)))throw Error('이 게임에 이미 있는 선수입니다. 기존 기록을 확인해주세요.');
    changes=[{range:`'일일 입력'!E${row}`,before:[[r[4]]],values:[[name]]},{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[[count]]}];
    summary=[`${game}번 · ${r[4]} → ${name} · ${count}바인`,b.reason];
   }else{
    const members=s.daily.slice(start,end).filter((entry,i)=>{
     if(start+i===row-1||[0,1,2,3,4,7].every(c=>entry[c]===''||entry[c]==null))return false;
     if(!entry[4]||entry[1]!==r[1]||tableLabel(entry[2])!==tableLabel(r[2])||entry[3]!==r[3]||[0,1,2,3,4,7].some(c=>String(entry[c]||'').startsWith('=')))throw Error('게임 내 수기 항목을 확인한 뒤 삭제해주세요.');
     return true;
    }).map((entry,i)=>[i===0?game:'',...pad(entry,8).slice(1)]);
    for(let i=start;i<end;i++){
     const before=pad(s.daily[i],8),after=pad(members[i-start]||[],8);
     if(JSON.stringify(before.slice(0,5))!==JSON.stringify(after.slice(0,5)))changes.push({range:`'일일 입력'!A${i+1}:E${i+1}`,before:[before.slice(0,5)],values:[after.slice(0,5)]});
     if(before[7]!==after[7])changes.push({range:`'일일 입력'!H${i+1}`,before:[[before[7]]],values:[[after[7]]]});
    }
    summary=[`${game}번 · ${r[4]} 참가 기록 삭제`,b.reason];
   }
  }
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
