import {createHash} from 'node:crypto';
import {settlementProfile as profile} from './settlement-profile';
export type Issue={kind:string;message:string;sheet?:string;row?:number;date?:string;game?:number;messageId?:number};
export function isoDate(v:any):string|null{
 if(typeof v==='number'&&Number.isFinite(v)&&v>25000&&v<100000)return new Date(Math.floor(v-25569)*86400000).toISOString().slice(0,10);
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
 const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?v:null;
}
export function weekOf(value:string){
 if(!isoDate(value))throw Error('날짜를 확인해주세요.');
 const d=new Date(value+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
 const start=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};
}
export const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:profile.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const present=(v:any)=>v!==null&&v!==undefined&&v!=='';
const money=(v:any)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function buildSettlement(day:string,daily:any[][],fnb:any[][],weekly:any[][],salary:number|null,pending:any[]=[],today=localToday()){
 const {start,end}=weekOf(day),issues:Issue[]=[],columns=profile.columns;
 if(!profile.dailyHeaders.every((v,i)=>daily[0]?.[i]===v))throw Error('일일 입력의 열 구성이 변경됐어요. 연결 설정을 확인해주세요.');
 const sourceDaily:any[]=[],sourceFnb:any[]=[],invalid:any[]=[],seen=new Set<string>();
 const totals={buyins:0,rake:0,back:0,mongol:0,japan:0,china:0,house:0,korea2:0,fnb:0,fnbExcluded:0,fnbDeductible:0};
 const days:Record<string,{date:string;buyins:number;rake:number;back:number;fnb:number;fnbDeductible:number;fnbExcluded:number;payout:number;net:number;participants:number;games:number;issues:Issue[]}>={};
 const dailyGames:Record<string,Set<string>>={};
 for(let i=0;i<7;i++){const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);days[date]={date,buyins:0,rake:0,back:0,fnb:0,fnbDeductible:0,fnbExcluded:0,payout:0,net:0,participants:0,games:0,issues:[]};dailyGames[date]=new Set();}
 const groups:Record<string,{agency:string;buyins:number;rake:number;back:number}>={};
 let currentGame:number|undefined,lastDate:string|null=null;
 daily.slice(1).forEach((r,i)=>{
  const rowDate=isoDate(r[columns.date]);if(rowDate&&rowDate!==lastDate){currentGame=undefined;lastDate=rowDate;}if(present(r[0]))currentGame=Number(r[0]);
  if(!present(r[4]))return;
  const date=isoDate(r[columns.date]);if(!date){issues.push({kind:'date',message:'참가자의 날짜를 확인해주세요.',sheet:profile.tabs.daily,row:i+2});invalid.push(['daily',i+2,r]);return;}
  if(date<start||date>end)return;sourceDaily.push({row:i+2,values:r});
  const location={sheet:profile.tabs.daily,row:i+2,date,game:Number.isInteger(currentGame)?currentGame:undefined};
  days[date].participants++;dailyGames[date].add([currentGame??'',r[2],r[3]].join('|'));
  const key=[date,r[columns.table],String(r[4]).replace(/\s/g,'').toUpperCase()].join('|');
  if(seen.has(key))issues.push({kind:'duplicate',message:`${r[4]} · ${r[2]} 중복 여부 확인`,...location});seen.add(key);
  if(!present(r[2])||!present(r[3])||!present(r[6]))issues.push({kind:'missing',message:`${r[4]} · 테이블·블라인드·소속을 확인해주세요.`,...location});
  const agency=String(r[6]||'미지정');groups[agency]??={agency,buyins:0,rake:0,back:0};
  for(const field of ['buyins','rake','back','mongol','japan','china','house','korea2'] as const){
   const v=r[columns[field]];if(!money(v)){issues.push({kind:'amount',message:`${r[4]} · ${profile.dailyHeaders[columns[field]]} 값 또는 수식 오류`,...location});continue;}
   totals[field]+=v;if(field==='buyins'||field==='rake'||field==='back'){days[date][field]+=v;groups[agency][field]+=v;}
   else days[date].payout+=v;
  }
 });
 fnb.slice(1).forEach((r,i)=>{
  if(!r.some(present))return;const date=isoDate(r[0]);
  if(!date){issues.push({kind:'date',message:'F&B 날짜를 확인해주세요.',sheet:profile.tabs.fnb,row:i+2});invalid.push(['fnb',i+2,r]);return;}
  if(date<start||date>end)return;sourceFnb.push({row:i+2,values:r});
  if(!money(r[2]))issues.push({kind:'amount',message:'F&B 금액을 확인해주세요.',sheet:profile.tabs.fnb,row:i+2,date});else{totals.fnb+=r[2];days[date].fnb+=r[2];if(r[1]==='3F'){totals.fnbExcluded+=r[2];days[date].fnbExcluded+=r[2];}else{totals.fnbDeductible+=r[2];days[date].fnbDeductible+=r[2];}}
 });
 if(salary!==null&&!money(salary))throw Error('급여 선지출은 0 이상의 정수로 입력해주세요.');
 const sheetWeek=isoDate(weekly[1]?.[1]),sameWeek=sheetWeek===start;
 const fromSheet=sameWeek&&money(weekly[12]?.[1])?weekly[12][1]:null;
 const salaryValue=salary??fromSheet;
 if(salaryValue===null)issues.push({kind:'salary',message:'이 기간의 직원 급여 선지출을 확인해주세요. 없으면 0을 입력하세요.'});
 const expense=totals.fnbDeductible+totals.mongol+totals.japan+totals.china+totals.house+totals.korea2+(salaryValue??0);
 const net=totals.back-expense;
 if(!Object.values(totals).every(Number.isSafeInteger)||!Number.isSafeInteger(expense)||!Number.isSafeInteger(net))throw Error('합계가 계산 범위를 벗어났어요.');
 const checks=sameWeek?[[5,totals.back],[6,totals.fnbDeductible],[7,totals.mongol],[8,totals.japan],[9,totals.china],[10,totals.house],[11,totals.korea2]].map(([row,expected])=>({label:String(weekly[row]?.[0]||''),actual:weekly[row]?.[1]??null,expected,match:weekly[row]?.[1]===expected})):[];
 if(checks.some(c=>!c.match))issues.push({kind:'comparison',message:'기존 주간정산표와 합계가 달라요. 원본 수식을 확인해주세요.'});
 const shares=sameWeek?weekly.slice(17,20).map(r=>({label:String(r?.[0]||''),amount:r?.[1]??null})):[];
 if(shares.some(s=>typeof s.amount==='number'&&s.amount<0))issues.push({kind:'share',message:'기존 주간정산표의 배분액이 음수예요. 반올림 잔액과 배분 기준을 확인해주세요.'});
 pending.forEach(p=>issues.push({kind:'pending',message:p.question||'처리를 확인할 메시지가 있어요.',date:p.date,game:p.games?.length===1?p.games[0]:undefined,messageId:p.messageId}));
 for(const d of Object.values(days)){d.games=dailyGames[d.date].size;d.net=d.back-d.fnbDeductible-d.payout;d.issues=issues.filter(i=>i.date===d.date||(!i.date&&i.kind==='date'));}
 // The shared weekly tab's date selector is not a source transaction. Moving it
 // to another week must not invalidate an otherwise unchanged saved report.
 const sourceHash=createHash('sha256').update(JSON.stringify({fnbPolicy:'exclude-3F-v1',profile, start,end,sourceDaily,sourceFnb,invalid,salaryValue,pending})).digest('hex');
 return {room:profile.name,roomId:profile.id,start,end,today,closed:end<today,generatedAt:new Date().toISOString(),sourceHash,totals,salary:salaryValue,salarySource:salary!==null?'manager':fromSheet!==null?'sheet':'missing',expense,net,days:Object.values(days),agencies:Object.values(groups),issues,pending,checks,shares,sameWeek,sheetWeek,sourceDaily,sourceFnb,canConfirm:end<today&&issues.length===0};
}
export function reportText(r:ReturnType<typeof buildSettlement>){
 const n=(v:number)=>v.toLocaleString('en-US');
 return [`${r.room} 주간정산 초안`,`${r.start} ~ ${r.end} · VND`,r.closed?'기간 종료':'진행 중인 주간',`바이인 ${n(r.totals.buyins)}회`,`레이크 ${n(r.totals.rake)}`,`총 레이크백 ${n(r.totals.back)}`,`F&B 전체 ${n(r.totals.fnb)}`,`F&B 수익 차감 ${n(r.totals.fnbDeductible)}`,`3F F&B 별도 정산 (수익 차감 제외) ${n(r.totals.fnbExcluded)}`,`코드별 정산금 ${n(r.totals.mongol+r.totals.japan+r.totals.china+r.totals.house+r.totals.korea2)}`,`직원 급여 선지출 ${r.salary===null?'미확인':n(r.salary)}`,`총 비용 ${n(r.expense)}${r.salary===null?' (급여 제외)':''}`,`정산 잔액 ${n(r.net)}${r.salary===null?' (급여 제외)':''}`,`확인 필요 ${r.issues.length}건`,'원본: 일일 입력·F&B 입력. 기타 지출과 지급 완료 여부는 포함하지 않음.'].join('\n');
}
