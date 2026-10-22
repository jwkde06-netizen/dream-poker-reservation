/** Cashier comparison is read-only. Never repair either ledger by guessing. */
export type Entry={game:number;table?:string;player:string;buyins:number;amount:number};
export type Statement={date:string;currency:'VND';complete:boolean;entries:Entry[];totalBuyins:number;totalAmount:number};
export type GameMapping={date:string;printedGame:number;game:number};
export type Difference={game:number;table:string;player:string;kind:'missing_in_sheet'|'missing_in_cashier'|'count_or_amount';cashierBuyins:number;sheetBuyins:number;cashierAmount:number;sheetAmount:number};
export const playerKey=(value:string)=>typeof value==='string'?value.toUpperCase().replace(/[^A-Z0-9]/g,''):'';
export function compareCashier(statement:Statement,sheet:Entry[],date:string,options:{aliases?:Record<string,string>;gameMappings?:GameMapping[];requireGameMapping?:boolean}={}){
 const issues:string[]=[],differences:Difference[]=[];
 if(!statement||!Array.isArray(statement.entries)||!Array.isArray(sheet))throw Error('정산서 명단 형식을 확인해주세요.');
 const stamp=Date.parse(date+'T00:00:00Z');
 if(!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date)throw Error('영업일을 확인해주세요.');
 if([...statement.entries,...sheet].some(e=>!e||typeof e.player!=='string'))throw Error('선수 이름을 판독하지 못한 항목이 있습니다.');
 if(statement.date!==date)issues.push('정산서와 시트의 영업일이 다릅니다.');
 if(statement.currency!=='VND')issues.push('통화를 확인해주세요.');
 if(statement.complete!==true)issues.push('정산서 전체 페이지와 대상 코드 확인이 필요합니다.');
 const aliases=options.aliases||{};
 const name=(p:string)=>playerKey(aliases[playerKey(p)]||p);
 const mappings=(options.gameMappings||[]).filter(m=>m.date===date);
 const cashier:Entry[]=statement.entries.map(e=>{
  const targets=new Set(mappings.filter(m=>m.printedGame===e.game).map(m=>m.game));
  if(targets.size>1||(options.requireGameMapping&&targets.size===0))issues.push(`캐셔 No.${e.game}의 실제 게임번호를 확인해주세요.`);
  return {...e,game:targets.size===1?Array.from(targets)[0]:e.game};
 });
 const valid=(e:Entry)=>Number.isSafeInteger(e.game)&&e.game>0&&!!name(e.player)&&Number.isSafeInteger(e.buyins)&&e.buyins>0&&Number.isSafeInteger(e.amount)&&e.amount>=0;
 const index=(entries:Entry[],label:string)=>{
  const map=new Map<string,Entry>();
  for(const e of entries){
   if(!valid(e)){issues.push(`${label}에 판독 또는 숫자 확인이 필요한 항목이 있습니다.`);continue;}
   const key=e.game+'|'+name(e.player);
   if(map.has(key)){issues.push(`${label} ${e.game}번 게임 ${e.player} 중복 항목입니다.`);continue;}
   map.set(key,e);
  }return map;
 };
 const a=index(cashier,'캐셔'),b=index(sheet,'우리 시트');
 if(!a.size||!b.size)issues.push('대조할 명단이 비어 있습니다.');
 if(!Number.isSafeInteger(statement.totalBuyins)||!Number.isSafeInteger(statement.totalAmount)||statement.totalBuyins!==cashier.reduce((n,e)=>n+e.buyins,0)||statement.totalAmount!==cashier.reduce((n,e)=>n+e.amount,0))issues.push('캐셔 세부 내역 합계가 정산서 총계와 다릅니다.');
 for(const key of Array.from(new Set([...Array.from(a.keys()),...Array.from(b.keys())]))){
  const x=a.get(key),y=b.get(key),e=y||x!;
  if(x&&y&&x.table&&y.table&&x.table!==y.table)issues.push(`${e.game}번 게임 ${e.player} 테이블 표기를 확인해주세요.`);
  if(!x||!y||x.buyins!==y.buyins||x.amount!==y.amount)differences.push({game:e.game,table:y?.table||x?.table||'',player:e.player,kind:!y?'missing_in_sheet':!x?'missing_in_cashier':'count_or_amount',cashierBuyins:x?.buyins||0,sheetBuyins:y?.buyins||0,cashierAmount:x?.amount||0,sheetAmount:y?.amount||0});
 }
 differences.sort((a,b)=>a.game-b.game||a.player.localeCompare(b.player));
 return {matched:issues.length===0&&differences.length===0,date,issues:Array.from(new Set(issues)),differences,totals:{cashierBuyins:cashier.reduce((n,e)=>n+e.buyins,0),sheetBuyins:sheet.reduce((n,e)=>n+e.buyins,0),cashierAmount:cashier.reduce((n,e)=>n+e.amount,0),sheetAmount:sheet.reduce((n,e)=>n+e.amount,0)}};
}
export function discrepancyText(result:ReturnType<typeof compareCashier>){
 if(result.matched)return '명단·바이인·금액 대조 완료 ✅';
 const lines=[`${result.date} 정산 확인`,...result.issues];
 for(const d of result.differences){
  lines.push(`\n${d.game}번 게임${d.table?' / '+d.table:''} ${d.player}`);
  lines.push(`캐셔 ${d.cashierBuyins}바이인 / 우리 시트 ${d.sheetBuyins}바이인`);
  if(d.kind==='missing_in_sheet')lines.push('우리 시트에 없음');
  if(d.kind==='missing_in_cashier')lines.push('캐셔 명단에 없음');
  const delta=d.sheetAmount-d.cashierAmount;
  if(delta)lines.push(`우리 시트 금액 ${Math.abs(delta).toLocaleString('en-US')}동 ${delta<0?'적음':'많음'}`);
 }
 return lines.join('\n');
}
