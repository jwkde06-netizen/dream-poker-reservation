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
export function planOperations(ops:any[],daily:any[][],fnb:any[][],master:any[][],settings:{tableRoundLabels?:boolean;rebuySnapshot?:boolean}={}){
 if(!Array.isArray(ops)||ops.length<1||ops.length>20)throw Error('처리할 항목을 구체적으로 알려주세요.');
 const changes:CellChange[]=[],summary:string[]=[];const work=daily.map(r=>[...r]);let frow=fnb.length+1,mrow=master.length+1;
 const names=new Map<string,string[]>();for(const r of master.slice(1)){if(!r[0])continue;const k=norm(r[0]);names.set(k,Array.from(new Set([...(names.get(k)||[]),String(r[0])])));}
 let next=Math.max(3,work.length+1);
 function add(range:string,before:any[][],values:any[][]){if(changes.some(x=>x.range===range))throw Error('같은 항목을 두 번 수정하는 요청입니다. 나눠서 보내주세요.');changes.push({range,before,values});}
 for(const original of ops){
 const op={...original};
 if(op.kind==='register'){
  const name=String(op.player||'').trim().toUpperCase();
  if(!/^[A-Z][A-Z .'-]{2,79}$/.test(name))throw Error('등록할 영문 이름을 확인해주세요.');
  if(names.has(norm(name))){summary.push(`${name}은 이미 명단에 있어요.`);continue;}
  // Registration records identity only. Agency assignment is a separate verified action.
  if(op.agency)throw Error('신규 선수 소속 코드는 확인 후 지정해주세요.');
  if(mrow>2500)throw Error('플레이어 명단 행을 확장해야 합니다.');
  add(`'플레이어 명단'!A${mrow}:D${mrow}`,[['','','','']],[[name,'','','소속 코드 확인 대기']]);mrow++;
  names.set(norm(name),[name]);summary.push(`${name} 이름을 등록했어요.`);continue;
 }
 const day=serial(op.date);
 if(settings.rebuySnapshot&&['add','total'].includes(op.kind)){
  let g:any=null;const games=new Set<number>();
  for(const r of work.slice(1)){if(r[0]!==''&&r[0]!=null)g=r[0];if(Number(r[1])===day&&Number(tableLabel(r[2]).split('-')[0])===op.table&&r[3]===op.blind&&norm(r[4])===norm(op.player))games.add(Number(g));}
  if(!games.has(op.game)){
   if(games.size!==1)throw Error(`${op.player} 리바인을 반영할 게임 번호를 알려주세요.`);
   op.game=Array.from(games)[0];
  }
  op.kind='total';
 }

 if(op.kind==='fnb'){
  if(!['2F','3F','4F'].includes(op.floor)||!Number.isSafeInteger(op.amount)||op.amount<=0||op.amount>100000000||typeof op.note!=='string'||!op.note.trim()||op.note.length>500)throw Error('F&B의 날짜·층·총금액·사용자를 알려주세요.');
  if(frow>2000)throw Error('F&B 시트 행을 확장해야 합니다.');
  add(`'F&B 입력'!A${frow}:D${frow}`,[['','','','']],[[day,op.floor,op.amount,op.note]]);frow++;
  summary.push(`${op.floor.replace('F','층')} ${op.note}, ${op.amount.toLocaleString('en-US')}동 지출로 적었어요.`);continue;
 }
 if(!['add','total','cancel'].includes(op.kind)||!Number.isInteger(op.game)||op.game<1||op.game>100||!Number.isInteger(op.table)||op.table<1||op.table>100||!['3M','5M','10M','15M'].includes(op.blind))throw Error('게임 번호·테이블·블라인드를 알려주세요.');
 const matching=names.get(norm(op.player))||[];if(matching.length!==1)throw Error(`명단에서 ${String(op.player).slice(0,80)} 이름을 하나로 찾지 못했습니다. 영문명 또는 카드 번호를 알려주세요.`);
 const name=matching[0];let game:any=null;const found:number[]=[];
 if(op.kind==='add'&&!master.slice(1).some(r=>norm(r[0])===norm(name)&&String(r[2]||'').trim()))throw Error(`${name} 소속 코드를 알려주세요.`);
 for(let i=1;i<work.length;i++){const r=work[i];if(r[0]!==''&&r[0]!=null)game=r[0];if(Number(r[1])===day&&Number(game)===op.game&&Number(tableLabel(r[2]).split('-')[0])===op.table&&r[3]===op.blind&&norm(r[4])===norm(name))found.push(i);}
 if(found.length>1)throw Error(`${name} 항목이 중복되어 있어 확인이 필요합니다.`);
 let displayTable:any=found.length?work[found[0]][2]:op.table;
 const previousBuyins=found.length?Number(work[found[0]][7]):0;
 if(op.kind==='add'){
  if(found.length){summary.push(`${op.table}번 테이블 ${name}은 이미 시트에 있어요.`);continue;}
  if(!Number.isInteger(op.buyins)||op.buyins<1||op.buyins>50)throw Error('바이인 수를 확인해주세요.');
  if(next>5000)throw Error('일일 입력 시트 행을 확장해야 합니다.');
  let tableLabel:any=op.table;
  if(settings.tableRoundLabels){
   let group:any=null,maxRound=0;const games=new Set<number>();
   for(const r of work.slice(1)){if(r[0]!==''&&r[0]!=null)group=r[0];const label=normalizeTable(r[2]);if(Number(r[1])===day&&Number(label.split('-')[0])===op.table&&r[4]){games.add(Number(group));maxRound=Math.max(maxRound,Number(label.split('-')[1])||1);if(Number(group)===op.game)tableLabel=label;}}
   if(tableLabel===op.table)tableLabel=String(op.table)+'-'+(games.has(op.game)?Math.max(maxRound,games.size):Math.max(maxRound,games.size)+1);
  }
  add(`'일일 입력'!A${next}:E${next}`,[['','','','','']],[[op.game,day,tableLabel,op.blind,name]]);
  add(`'일일 입력'!H${next}`,[['']],[[op.buyins]]);
  displayTable=tableLabel;
  work[next-1]=[op.game,day,tableLabel,op.blind,name,'','',op.buyins];next++;
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
   add(`'일일 입력'!H${row}`,[[r[7]??'']],[[op.buyins]]);work[idx][7]=op.buyins;
  }
 }
 const label=Number(displayTable)>100?String(op.table):String(displayTable);
 const who=`${label} 테이블 ${name}`;
 summary.push(op.kind==='cancel'?`${who} 명단에서 뺐어요.`:op.kind==='add'?`${who} ${op.buyins}바인으로 시트에 추가했어요.`:op.buyins===previousBuyins?`${who}은 이미 총 ${op.buyins}바인으로 적혀 있어요.`:`${who} 리바인 ${op.buyins-previousBuyins}회 반영해서 총 ${op.buyins}바인으로 수정했어요.`);
 }
 return {changes,summary};
}
