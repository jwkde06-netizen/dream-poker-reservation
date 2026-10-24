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
 if(b.kind==='game_edit'){
  const date=serial(b.date);integer(b.game,1,100);
  if(typeof b.tableLabel!=='string'||!/^([1-9]\d?)(?:-([1-9]\d?))?$/.test(b.tableLabel)||!['3M','5M','10M','15M'].includes(b.blind))throw Error('테이블과 게임 포맷을 확인해주세요.');
  if(typeof b.sourceNo!=='string'||!/^\d{0,8}$/.test(b.sourceNo))throw Error('No.는 8자리 이내 숫자로 입력해주세요.');
  let game=0,lastDate:any=null;const members:{r:any[];i:number}[]=[];
  for(let i=1;i<s.daily.length;i++){const r=s.daily[i];if(r[1]!==''&&r[1]!=null&&r[1]!==lastDate){game=0;lastDate=r[1];}if(r[0]!==''&&r[0]!=null)game=Number(r[0]);if(Number(r[1])!==date||!r[4])continue;if(game===b.game)members.push({r,i});else if(tableLabel(r[2])===b.tableLabel)throw Error('이 테이블 표기는 다른 게임에서 사용 중입니다. 테이블 회차를 확인해주세요.');}
  if(!members.length||members.some(({r})=>tableLabel(r[2])!==b.expectedTable||r[3]!==b.expectedBlind))throw Error('게임 정보가 변경됐습니다. 새로고침 후 수정해주세요.');
  for(const {r,i} of members){if([0,1,2,3,4,7].some(c=>String(r[c]||'').startsWith('=')))throw Error('수기 수식이 포함된 게임은 자동 수정할 수 없습니다.');changes.push({range:`'일일 입력'!C${i+1}:D${i+1}`,before:[[r[2],r[3]]],values:[[b.tableLabel,b.blind]]});}
  summary=[`${b.game}번 · 테이블 ${b.tableLabel} · ${b.blind} · No. ${b.sourceNo||'—'} 수정`];
 }else if(b.kind==='scan'){
  const date=serial(b.date);integer(b.game,1,100);integer(b.table,1,100);
  if(!['new','existing'].includes(b.mode)||!['3M','5M','10M','15M'].includes(b.blind)||!Array.isArray(b.players)||!b.players.length||b.players.length>20)throw Error('입력할 게임과 명단을 확인해주세요.');
  let game=0,lastDate:any=null;const current=s.daily.filter(r=>{if(r[1]!==''&&r[1]!=null&&r[1]!==lastDate){game=0;lastDate=r[1];}if(r[0]!==''&&r[0]!=null)game=Number(r[0]);return Number(r[1])===date&&game===b.game&&r[4];});
  if(b.mode==='new'&&current.length)throw Error('이미 있는 게임입니다. 기존 게임을 선택해주세요.');
  if(b.mode==='existing'&&(!current.length||current.some(r=>Number(tableLabel(r[2]).split('-')[0])!==b.table||r[3]!==b.blind)))throw Error('선택한 게임의 테이블·포맷이 변경됐습니다. 다시 확인해주세요.');
  const seen=new Set<string>(),ops=b.players.map((p:any)=>{const player=txt(p.player,80),k=norm(player);if(seen.has(k))throw Error('같은 플레이어가 중복되었습니다.');seen.add(k);return {kind:current.some(r=>norm(r[4])===k)?'total':'add',date:b.date,game:b.game,table:b.table,blind:b.blind,player,buyins:integer(p.buyins,1,50),gameConfirmed:true};});
  const p=planOperations(ops,s.daily,s.fnb,s.master,{tableRoundLabels:true,photoSnapshot:true});changes=p.changes;summary=p.summary;
 }else if(b.kind==='game'){
  serial(b.date);integer(b.game,1,100);integer(b.table,1,100);
  if(!['3M','5M','10M','15M'].includes(b.blind)||!Array.isArray(b.players)||!b.players.length||b.players.length>20)throw Error('게임과 참가자를 확인해주세요.');
  const seen=new Set();const ops=b.players.map((p:any)=>{const player=txt(p.player,80),key=norm(player);if(seen.has(key))throw Error('같은 선수가 두 번 선택됐어요.');seen.add(key);return {kind:'add',date:b.date,game:b.game,table:b.table,blind:b.blind,player,buyins:integer(p.buyins,1,50)};});
  const p=planOperations(ops,s.daily,s.fnb,s.master,{tableRoundLabels:true});changes=p.changes;summary=p.summary;
 }else if(b.kind==='buyins'||b.kind==='cancel'||b.kind==='participant'){
  const row=integer(b.row,2,s.daily.length),r=s.daily[row-1];if(!r?.[4])throw Error('선수 기록이 없어요. 새로고침해주세요.');if(JSON.stringify(b.expected)!==JSON.stringify([...pad(r,5),r[7]??'']))throw Error('선수 기록이 변경됐어요. 새로고침해주세요.');
  if(b.kind==='buyins'){const count=integer(b.buyins,1,50);changes=[{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[[count]]}];summary=[`${r[4]} · ${r[2]} 테이블 · 총 ${r[7]} → ${count}바인`,...(b.reason?[String(b.reason)]:[])];}
  else{
   const reason=b.reason?txt(b.reason,200):b.kind==='cancel'?'직접 삭제':'직접 수정';
   let start=row-1;while(start>1&&!s.daily[start][0])start--;
   const game=Number(s.daily[start][0]);if(!Number.isSafeInteger(game)||game<1)throw Error('게임 번호를 확인해주세요.');
   let end=start+1;while(end<s.daily.length&&!s.daily[end][0])end++;
   if(b.kind==='participant'){
    const target=txt(b.player,80),matches=s.master.slice(1).filter(m=>norm(m[0])===norm(target));
    if(matches.length!==1||!String(matches[0][2]||'').trim())throw Error('등록된 선수와 소속 코드를 확인해주세요.');
    const name=String(matches[0][0]),count=integer(b.buyins,1,50);
    if(s.daily.slice(start,end).some((entry,i)=>start+i!==row-1&&norm(entry[4])===norm(name)))throw Error('이 게임에 이미 있는 선수입니다. 기존 기록을 확인해주세요.');
    changes=[{range:`'일일 입력'!E${row}`,before:[[r[4]]],values:[[name]]},{range:`'일일 입력'!H${row}`,before:[[r[7]??'']],values:[[count]]}];
    summary=[`${game}번 · ${r[4]} → ${name} · ${count}바인`,reason];
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
    summary=[`${game}번 · ${r[4]} 참가 기록 삭제`,reason];
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
