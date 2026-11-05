// Staff shift notice for the Dream Staff room. Pure helpers only: no network, no secrets.
// The workbook is fixed here and never taken from a Telegram message.
export const scheduleWorkbook='1tRVHLmcvDYqr7s9R98VrNLz9mzVUWMnZ7l9ca02gtK0';
// Staff whose last working day has passed are left out of notices even if the sheet still lists them.
export const retiredStaff:Record<string,string>={'혜인':'2026-11-02','황해인':'2026-11-02','해인':'2026-11-02'};
const shiftHours=8;
const days=['일','월','화','수','목','금','토'];

export type Shift={name:string;start:string;end:string}|{name:string;off:true};
export type ScheduleResult={status:'ready';date:string;text:string;shifts:Shift[]}|{status:'missing'|'invalid';date:string;reason:string;detail?:string[]};

// Date in Vietnam (UTC+7, no DST) for a given instant, offset by whole days.
export function vnDate(now:number,addDays=0){return new Date(now+7*3600000+addDays*86400000).toISOString().slice(0,10)}
export function monthTab(date:string){const [y,m]=date.split('-').map(Number);return `${y}년 ${m}월`}

// Monthly tab layout: a header row holds "M/D (요일)" cells, the rows below hold name in column A and a cell per day, until a blank row.
export function cellsForDate(values:unknown[][],date:string){
 const [,m,d]=date.split('-').map(Number);
 const out:{name:string;cell:string}[]=[];
 let col=-1;
 for(const row of values){
  const cells=(row||[]).map(v=>String(v??'').trim());
  if(!cells.some(Boolean)){col=-1;continue}
  const dateCols=cells.map((c,i)=>{const x=c.match(/^(\d{1,2})\/(\d{1,2})(?!\d)/);return x?{i,m:Number(x[1]),d:Number(x[2])}:null}).filter(Boolean) as {i:number;m:number;d:number}[];
  if(dateCols.length){col=dateCols.find(x=>x.m===m&&x.d===d)?.i??-1;continue}
  if(col<0||!cells[0])continue;
  out.push({name:cells[0],cell:cells[col]||''});
 }
 return out;
}

const hhmm=(h:number,mi:number)=>String(h%24).padStart(2,'0')+':'+String(mi).padStart(2,'0');
function parseTime(s:string){const x=s.match(/^(\d{1,2})(?::(\d{2}))?$/);if(!x)return null;const h=Number(x[1]),mi=Number(x[2]||0);return h<24&&mi<60?{h,mi}:null}
// Accepts "15:00", "15:00-23:00", "15:00~23:00", "15:00–23:00", "휴무"/"off".
export function parseShift(name:string,cell:string):Shift|null{
 const c=cell.replace(/\s+/g,'');
 if(/^(휴무|휴|off|OFF|Off|-)$/.test(c))return {name,off:true};
 const parts=c.split(/[-~–—]/);
 const start=parseTime(parts[0]||'');
 if(!start||parts.length>2)return null;
 if(parts.length===2){const end=parseTime(parts[1]);return end?{name,start:hhmm(start.h,start.mi),end:hhmm(end.h,end.mi)}:null}
 return {name,start:hhmm(start.h,start.mi),end:hhmm(start.h+shiftHours,start.mi)};
}

export function buildScheduleNotice(values:unknown[][],date:string):ScheduleResult{
 const rows=cellsForDate(values,date).filter(r=>!(retiredStaff[r.name]&&date>retiredStaff[r.name]));
 if(!rows.length)return {status:'missing',date,reason:'날짜 칸을 찾지 못함'};
 const blank=rows.filter(r=>!r.cell).map(r=>r.name);
 if(blank.length===rows.length)return {status:'missing',date,reason:'내일 근무가 출근표에 아직 없음'};
 if(blank.length)return {status:'missing',date,reason:'일부 직원 칸이 비어 있음',detail:blank};
 const shifts:Shift[]=[],bad:string[]=[];
 for(const r of rows){const s=parseShift(r.name,r.cell);if(s)shifts.push(s);else bad.push(`${r.name}: ${r.cell}`)}
 if(bad.length)return {status:'invalid',date,reason:'알아볼 수 없는 칸이 있음',detail:bad};
 const work=shifts.filter((s):s is {name:string;start:string;end:string}=>!('off' in s)).sort((a,b)=>a.start.localeCompare(b.start));
 const off=shifts.filter(s=>'off' in s).map(s=>s.name);
 const [,m,d]=date.split('-').map(Number);
 const dow=days[new Date(date+'T00:00:00Z').getUTCDay()];
 const lines=[`📅 내일 ${m}/${d}(${dow}) 근무`,...work.map(s=>`${s.name} ${s.start}–${s.end}`)];
 if(off.length)lines.push('휴무: '+off.join(', '));
 return {status:'ready',date,text:lines.join('\n'),shifts};
}
