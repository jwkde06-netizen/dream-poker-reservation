export type CellChange={range:string;before:any[][];values:any[][]};
export const norm=(s:unknown)=>String(s||'').toUpperCase().replace(/[^A-Z0-9가-힣]/g,'');
export function serial(date:string){
 if(!/^20\d\d-\d\d-\d\d$/.test(date))throw Error('영업일을 YYYY-MM-DD로 알려주세요.');
 const ms=Date.parse(date+'T00:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date)throw Error('날짜를 확인해주세요.');
 return ms/86400000+25569;
}
const pad=(r:any[],n:number)=>Array.from({length:n},(_,i)=>r?.[i]??'');
// Sheets may coerce a table label such as 5-2 into a date serial.
export function tableLabel(value:unknown){
 if(typeof value==='number'&&value>40000&&value<60000){const d=new Date((value-25569)*86400000);return `${d.getUTCMonth()+1}-${d.getUTCDate()}`;}
 return String(value??'');
}
const normalizeTable=tableLabel;
export function planOperations(ops:any[],daily:any[][],fnb:any[][],master:any[][],settings:{tableRoundLabels?:boolean;rebuySnapshot?:boolean;registrationApprovals?:Record<string,{agency:string;card?:string}>}={}){
 if(!Array.isArray(ops)||ops.length<1||ops.length>20)throw Error('처리할 항목을 구체적으로 알려주세요.');
 const changes:CellChange[]=[],summary:string[]=[];const work=daily.map(r=>[...r]),masterWork=master.map(r=>[...r]);let frow=fnb.length+1,mrow=master.length+1;
 const names=new Map<string,string[]>();for(const r of master.slice(1)){if(!r[0])continue;const k=norm(r[0]);names.set(k,Array.from(new Set([...(names.get(k)||[]),String(r[0])])));}
 let next=Math.max(3,work.length+1),reflow=false;
 function add(range:string,before:any[][],values:any[][]){if(changes.some(x=>x.range===range))throw Error('같은 항목을 두 번 수정하는 요청입니다. 나눠서 보내주세요.');changes.push({range,before,values});}
 // Resolve a rebuy photograph as ONE table session. Never put individual
 // players from a single snapshot into different games or create a new game.
 const resolved=ops.map(op=>({...op}));
 if(settings.rebuySnapshot){
  const groups=new Map<string,any[]>();
  for(const op of resolved.filter(o=>['add','total'].includes(o.kind))){const key=[op.date,op.table,op.blind].join('|');groups.set(key,[...(groups.get(key)||[]),op]);}
  for(const group of Array.from(groups.values())){
   let common:Set<number>|undefined;
   for(const op of group){let g:any=null;const games=new Set<number>();for(const r of work.slice(1)){if(r[0]!==''&&r[0]!=null)g=r[0];if(Number(r[1])===serial(op.date)&&Number(tableLabel(r[2]).split('-')[0])===op.table&&r[3]===op.blind&&norm(r[4])===norm(op.player))games.add(Number(g));}common=common?new Set(Array.from(common).filter(g=>games.has(g))):games;}
   const requested=new Set(group.map(op=>op.game));
   const game=common?.size===1?Array.from(common)[0]:requested.size===1&&common?.has(group[0].game)?group[0].game:null;
   if(game==null)throw Error(`${group[0].table}번 테이블 리바인을 반영할 게임 번호를 알려주세요.`);
   for(const op of group){op.game=game;op.kind='total';}
  }
 }
 // Register first so an explicitly supplied agency can be used by the same
 // atomic batch's daily entries, regardless of model operation ordering.
 for(const original of [...resolved.filter(o=>o.kind==='register'),...resolved.filter(o=>o.kind!=='register')]){
 const op={...original};
 if(op.kind==='register'){
  const name=String(op.player||'').trim().toUpperCase();
  if(!/^[A-Z][A-Z .'-]{2,79}$/.test(name))throw Error('등록할 영문 이름을 확인해주세요.');
  const approval=settings.registrationApprovals?.[norm(name)];
  if(op.agency&&(!approval||approval.agency!==op.agency))throw Error(`${name} 소속 코드를 알려주세요.`);
  const agency=approval?.agency||'',card=approval?.card||'';
  if(names.has(norm(name))){
   const matches=masterWork.map((r,i)=>({r,i})).filter(x=>norm(x.r[0])===norm(name));
   if(matches.length!==1){summary.push(`${name}은 이미 명단에 있어요.`);continue;}
   const {r,i}=matches[0];
   if(agency&&r[2]&&r[2]!==agency)throw Error(`${name}은 기존 ${r[2]} 코드입니다. 소속 변경은 확인이 필요해요.`);
   if(card&&r[1]&&String(r[1])!==card)throw Error(`${name} 기존 카드 번호와 다릅니다.`);
   if(agency&&!r[2]){add(`'플레이어 명단'!C${i+1}`,[[r[2]||'']],[[agency]]);r[2]=agency;}
   if(card&&!r[1]){add(`'플레이어 명단'!B${i+1}`,[[r[1]||'']],[[card]]);r[1]=card;}
   summary.push(`${name}은 명단에 있어요.`);continue;
  }
  if(mrow>2500)throw Error('플레이어 명단 행을 확장해야 합니다.');
  const entry=[name,card,agency,agency?'직원 확인 등록':'소속 코드 확인 대기'];
  add(`'플레이어 명단'!A${mrow}:D${mrow}`,[['','','','']],[entry]);masterWork.push(entry);mrow++;
  names.set(norm(name),[name]);summary.push(`${name} 이름을 등록했어요.`);continue;
 }
 const day=serial(op.date);
 if(op.kind==='fnb'){
  if(!['2F','3F','4F','5F'].includes(op.floor)||!Number.isSafeInteger(op.amount)||op.amount<=0||op.amount>100000000||typeof op.note!=='string'||!op.note.trim()||op.note.length>500)throw Error('F&B의 날짜·층·총금액·사용자를 알려주세요.');
  if(frow>2000)throw Error('F&B 시트 행을 확장해야 합니다.');
  add(`'F&B 입력'!A${frow}:D${frow}`,[['','','','']],[[day,op.floor,op.amount,op.note]]);frow++;
  summary.push(`${op.floor.replace('F','층')} ${op.note}, ${op.amount.toLocaleString('en-US')}동 지출로 적었어요.`);continue;
 }
 if(!['add','total','cancel'].includes(op.kind)||!Number.isInteger(op.game)||op.game<1||op.game>100||!Number.isInteger(op.table)||op.table<1||op.table>100||!['3M','5M','10M','15M'].includes(op.blind))throw Error('게임 번호·테이블·블라인드를 알려주세요.');
 const candidates=names.get(norm(op.player))||[];const exact=candidates.filter(n=>n===String(op.player).trim());const matching=exact.length===1?exact:candidates;if(matching.length!==1)throw Error(`명단에서 ${String(op.player).slice(0,80)} 이름을 하나로 찾지 못했습니다. 영문명 또는 카드 번호를 알려주세요.`);
 const name=matching[0];let game:any=null;const found:number[]=[];
 if(op.kind==='add'&&!masterWork.slice(1).some(r=>norm(r[0])===norm(name)&&String(r[2]||'').trim()))throw Error(`${name} 소속 코드를 알려주세요.`);
 for(let i=1;i<work.length;i++){const r=work[i];if(r[0]!==''&&r[0]!=null)game=r[0];if(Number(r[1])===day&&Number(game)===op.game&&Number(tableLabel(r[2]).split('-')[0])===op.table&&r[3]===op.blind&&norm(r[4])===norm(name))found.push(i);}
 if(found.length>1)throw Error(`${name} 항목이 중복되어 있어 확인이 필요합니다.`);
 let displayTable:any=found.length?work[found[0]][2]:op.table;
 const previousBuyins=found.length?Number(work[found[0]][7]):0;
 if(op.kind==='add'){
  if(found.length){summary.push(`${op.table}번 테이블 ${name}은 이미 시트에 있어요.`);continue;}
  if(!Number.isInteger(op.buyins)||op.buyins<1||op.buyins>50)throw Error('바이인 수를 확인해주세요.');
  let tail=1,tailGame:any=null,groupHeading:any=null,seenGroup=false,targetLast=-1;
  for(let i=1;i<work.length;i++){
   const r=work[i];if(r[0]!==''&&r[0]!=null)groupHeading=r[0];
   if(r[4]){tail=i;tailGame=groupHeading;if(Number(r[1])===day&&Number(groupHeading)===op.game){seenGroup=true;targetLast=i;}}
   else if([0,1,2,3,7].some(c=>r[c]!==''&&r[c]!=null)){tail=i;tailGame=groupHeading;}
  }
  const continuing=!!work[tail]?.[4]&&Number(work[tail][1])===day&&Number(tailGame)===op.game;
  if(seenGroup&&!continuing){
   if(tail+2>5000)throw Error('일일 입력 시트 행을 확장해야 합니다.');
   if(work.slice(targetLast+1,tail+1).some(r=>[0,1,2,3,4,7].some(c=>String(r[c]||'').startsWith('='))))throw Error('아래쪽 수식 행 때문에 선수 추가 위치 확인이 필요합니다.');
   // Move only A:E and H business inputs in the final value batch. Formula
   // spill columns stay in place, and the existing blank game separator moves
   // down with the following games. All moved values are preflight checked.
   work.splice(targetLast+1,0,[]);reflow=true;next=targetLast+2;
  }else next=Math.max(3,tail+(continuing?2:3));
  if(next>5000)throw Error('일일 입력 시트 행을 확장해야 합니다.');
  const heading=seenGroup?'':op.game;
  while(work.length<next)work.push([]);
  let tableLabel:any=op.table;
  if(settings.tableRoundLabels){
   let group:any=null,maxRound=0;const games=new Set<number>();
   for(const r of work.slice(1)){if(r[0]!==''&&r[0]!=null)group=r[0];const label=normalizeTable(r[2]);if(Number(r[1])===day&&Number(label.split('-')[0])===op.table&&r[4]){games.add(Number(group));maxRound=Math.max(maxRound,Number(label.split('-')[1])||1);if(Number(group)===op.game)tableLabel=label;}}
   if(tableLabel===op.table)tableLabel=String(op.table)+'-'+(games.has(op.game)?Math.max(maxRound,games.size):Math.max(maxRound,games.size)+1);
  }
  add(`'일일 입력'!A${next}:E${next}`,[['','','','','']],[[heading,day,tableLabel,op.blind,name]]);
  add(`'일일 입력'!H${next}`,[['']],[[op.buyins]]);
  displayTable=tableLabel;
  work[next-1]=[heading,day,tableLabel,op.blind,name,'','',op.buyins];next++;
 }else{
  if(found.length!==1)throw Error(`${name}: 해당 날짜·게임·테이블의 기존 항목을 찾지 못했습니다.`);
  const idx=found[0],r=work[idx],row=idx+1;
  if(op.kind==='cancel'){
   // Clear only business inputs, leaving formula spill columns intact. Preserve
   // a game heading on the next member before clearing a heading row.
   if(r[0]&&work[idx+1]?.[4]&&!work[idx+1]?.[0]&&Number(work[idx+1]?.[1])===day){add(`'일일 입력'!A${row+1}`,[['']],[[r[0]]]);work[idx+1][0]=r[0];}
   add(`'일일 입력'!A${row}:E${row}`,[pad(r,5)],[['','','','','']]);add(`'일일 입력'!H${row}`,[[r[7]??'']],[['']]);work[idx]=[];
  }else{
   if(!Number.isInteger(op.buyins)||op.buyins<1||op.buyins>50)throw Error('누적 바이인 수를 알려주세요.');
   if(op.buyins<Number(r[7]))throw Error('기존보다 적은 바이인입니다. 정정 사유와 최종 수량을 확인해주세요.');
   if(op.buyins!==Number(r[7]))add(`'일일 입력'!H${row}`,[[r[7]??'']],[[op.buyins]]);work[idx][7]=op.buyins;
  }
 }
 const label=Number(displayTable)>100?String(op.table):String(displayTable);
 const who=`${label} 테이블 ${name}`;
 summary.push(op.kind==='cancel'?`${who} 명단에서 뺐어요.`:op.kind==='add'?`${who} ${op.buyins}바인으로 시트에 추가했어요.`:op.buyins===previousBuyins?`${who}은 이미 총 ${op.buyins}바인으로 적혀 있어요.`:`${who} 리바인 ${op.buyins-previousBuyins}회 반영해서 총 ${op.buyins}바인으로 수정했어요.`);
 }
 if(reflow){
  const other=changes.filter(c=>!c.range.startsWith("'일일 입력'!"));
  for(let i=1;i<Math.max(work.length,daily.length);i++){
   const before=pad(daily[i]||[],8),after=pad(work[i]||[],8);
   if(before.slice(0,5).some((v,j)=>v!==after[j]))other.push({range:`'일일 입력'!A${i+1}:E${i+1}`,before:[before.slice(0,5)],values:[after.slice(0,5)]});
   if(before[7]!==after[7])other.push({range:`'일일 입력'!H${i+1}`,before:[[before[7]]],values:[[after[7]]]});
  }
  return {changes:other,summary};
 }
 return {changes,summary};
}
