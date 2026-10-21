import {norm,serial,tableLabel,CellChange} from './accounting-plan';

export type Attendance={date:string;game:number;tableLabel:string;blind:string;player:string;buyins:number};
type Override={entry:Attendance;kind:'removed'|'count';observedAt:string;reason:'sheet_edit'|'staff_cancel'};
type Alias={date:string;fromGame:number;tableLabel:string;blind:string;sourceMessageIds:number[]};
export type SheetState={version:1;date:string;entries:Attendance[];overrides:Override[];aliases:Alias[]};
export type ReconcileOptions={state:SheetState;sourceMessageId?:number;sourceTime?:number;photo?:boolean;text?:string;pendingQuestion?:string};
const physical=(label:string)=>Number(label.split('-')[0]);
const session=(e:Attendance)=>[e.date,e.tableLabel,e.blind].join('|');
const key=(e:Attendance)=>session(e)+'|'+norm(e.player);
const sameGame=(e:Attendance,op:any)=>e.date===op.date&&e.game===op.game&&physical(e.tableLabel)===op.table&&e.blind===op.blind;

// Stable business keys survive inserted rows, moved game blocks and A-column
// renumbering. Seats and row numbers are deliberately not attendance identity.
export function attendance(daily:any[][],date:string):Attendance[]{
 let game=0;const day=serial(date),result:Attendance[]=[];
 for(const r of daily.slice(1)){
  if(r[0]!==''&&r[0]!=null)game=Number(r[0]);
  if(Number(r[1])!==day||!r[4]||!Number.isInteger(game)||game<1||game>100)continue;
  result.push({date,game,tableLabel:tableLabel(r[2]),blind:String(r[3]),player:String(r[4]),buyins:Number(r[7])});
 }
 return result;
}
export function changedDaily(daily:any[][],changes:CellChange[]){
 const after=daily.map(r=>[...r]);
 for(const c of changes){
  const m=c.range.match(/^'일일 입력'!([A-H])(\d+)(?::[A-H]\d+)?$/);if(!m)continue;
  const row=Number(m[2])-1,col=m[1].charCodeAt(0)-65;
  c.values.forEach((values,i)=>{while(after.length<=row+i)after.push([]);values.forEach((v,j)=>after[row+i][col+j]=v);});
 }
 return after;
}

// Upgrade existing jobs without rebuilding credentials or creating a second
// ledger. New jobs persist the entire day's observed inputs in plan.sheetState.
export function reconcileSheet(daily:any[][],date:string,jobs:any[],now=new Date().toISOString()):SheetState{
 const prior=jobs.find(j=>j.plan?.sheetState?.version===1&&j.plan.sheetState.date===date)?.plan.sheetState as SheetState|undefined;
 const applied=jobs.filter(j=>j.status==='applied'&&!j.plan?.reconciliation&&!j.plan?.manual_handoff).slice().reverse();
 let legacy:any[][]=[[]];
 if(!prior)for(const j of applied)legacy=changedDaily(legacy,j.plan?.changes||[]);
 const entries=attendance(daily,date);
 const oldRows=attendance(legacy,date).filter(e=>applied.some(j=>(j.plan?.operations||[]).some((op:any)=>sameGame(e,op)&&norm(e.player)===norm(op.player))));
 // Pre-upgrade logs can contain corrected/misnumbered rows. Require matching
 // operation provenance before turning an old row into a durable override.
 const before=prior?.entries||oldRows.map(e=>{
  const exact=entries.filter(live=>sameGame(live,{...e,table:physical(e.tableLabel)})&&norm(live.player)===norm(e.player));
  return exact.length===1?{...e,tableLabel:exact[0].tableLabel}:e;
 });
 const overrides=new Map((prior?.overrides||[]).map(o=>[key(o.entry),o]));
 const aliases=new Map((prior?.aliases||[]).map(a=>[[a.date,a.fromGame,a.tableLabel,a.blind].join('|'),a]));
 for(const old of before){
  const current=entries.filter(e=>key(e)===key(old));
  if(current.length>1)continue; // The planner reports ambiguous duplicate rows.
  const live=current[0],sameSession=entries.filter(e=>session(e)===session(old));
  const games=Array.from(new Set(sameSession.map(e=>e.game)));
  const entry={...old,...(games.length===1?{game:games[0]}:{})};
  if(!live)overrides.set(key(old),{entry,kind:'removed',observedAt:now,reason:'sheet_edit'});
  else if(live.buyins!==old.buyins)overrides.set(key(old),{entry:live,kind:'count',observedAt:now,reason:'sheet_edit'});
  if(games.length===1&&games[0]!==old.game){
   const sourceMessageIds=applied.filter(j=>(j.plan?.operations||[]).some((op:any)=>sameGame(old,op))).map(j=>j.plan?.photoSourceMessageId||j.message_id).filter(Number.isSafeInteger);
   const alias:Alias={date,fromGame:old.game,tableLabel:old.tableLabel,blind:old.blind,sourceMessageIds:Array.from(new Set(sourceMessageIds))};
   aliases.set([date,old.game,old.tableLabel,old.blind].join('|'),alias);
  }
 }
 // A person manually restored to that SAME session is present again. A move to
 // a different game does not clear the old game's removal.
 for(const [k,o] of Array.from(overrides)){
  const live=entries.find(e=>key(e)===k);
  if(o.kind==='removed'&&live)overrides.delete(k);
  else if(o.kind==='removed'){
   const games=Array.from(new Set(entries.filter(e=>session(e)===session(o.entry)).map(e=>e.game)));
   if(games.length===1)o.entry={...o.entry,game:games[0]};
  }
 }
 return {version:1,date,entries,overrides:Array.from(overrides.values()),aliases:Array.from(aliases.values())};
}

function explicitAttendance(op:any,text:string,pendingQuestion=''){
 const named=norm(text).includes(norm(op.player));
 const games=Array.from(text.matchAll(/(\d{1,2})\s*번\s*게임/g)).map(m=>Number(m[1]));
 const positive=/다시\s*(참가|참여|합류|추가)|참가했|참여했|참가해|참여해|합류했|합류해|재참가|재합류|복구|rejoin|restore/i.test(text);
 const negative=/하지\s*마|안\s*(해|하|참|들)|취소|불참|don't|do not/i.test(text);
 if(named&&games.includes(op.game)&&positive&&!negative)return true;
 return /^(네|넵|응|맞아|맞아요|yes)[.!\s]*$/i.test(text.trim())&&norm(pendingQuestion).includes(norm(op.player))&&pendingQuestion.includes(`${op.game}번 게임`)&&/다시 참가/.test(pendingQuestion);
}

export function reconcileOperation(original:any,options:ReconcileOptions):{op:any;question?:string;skip?:boolean}{
 const op={...original},state=options.state;
 if(!['add','total','cancel'].includes(op.kind)||op.date!==state.date)return {op};
 // Only a linked historical source can use an inferred renumbering. A new
 // game's identical player list is never enough to merge it into an old game.
 const aliases=state.aliases.filter(a=>a.date===op.date&&a.fromGame===op.game&&physical(a.tableLabel)===op.table&&a.blind===op.blind&&options.sourceMessageId!=null&&a.sourceMessageIds.includes(options.sourceMessageId));
 if(aliases.length===1){
  const games=Array.from(new Set(state.entries.filter(e=>session(e)===[op.date,aliases[0].tableLabel,op.blind].join('|')).map(e=>e.game)));
  if(games.length===1)op.game=games[0];
 }
 const live=state.entries.filter(e=>sameGame(e,op)&&norm(e.player)===norm(op.player));
 const override=state.overrides.find(o=>sameGame(o.entry,op)&&norm(o.entry.player)===norm(op.player));
 if(override?.kind==='removed'&&!live.length){
  if(op.kind==='cancel')return {op,skip:true};
  if(!explicitAttendance(op,options.text||'',options.pendingQuestion))return {op,skip:true,question:`${op.game}번 게임에서 빠진 ${op.player}님, 다시 참가한 게 맞나요?`};
  op.kind='add';
 }
 if(options.photo&&override?.kind==='count'&&live.length===1&&Number(op.buyins)!==live[0].buyins){
  const stale=!options.sourceTime||options.sourceTime*1000<=Date.parse(override.observedAt);
  // Old photos cannot undo a manual count correction. A newly submitted
  // cumulative rebuy snapshot can still raise the current total normally.
  if(stale)return {op,skip:true};
 }
 return {op};
}

export function afterVerifiedWrite(state:SheetState,daily:any[][],changes:CellChange[],now=new Date().toISOString()):SheetState{
 const entries=attendance(changedDaily(daily,changes),state.date);
 const overrides=new Map(state.overrides.map(o=>[key(o.entry),o]));
 for(const old of state.entries){
  const live=entries.find(e=>key(e)===key(old));
  if(!live)overrides.set(key(old),{entry:old,kind:'removed',observedAt:now,reason:'staff_cancel'});
  else if(live.buyins!==old.buyins)overrides.delete(key(old));
 }
 for(const live of entries)if(overrides.get(key(live))?.kind==='removed')overrides.delete(key(live));
 return {...state,entries,overrides:Array.from(overrides.values())};
}
