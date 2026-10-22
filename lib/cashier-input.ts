import {Statement,GameMapping} from './cashier-reconciliation';
export type CashierInput={sourceId:string;statement:Statement;evidence:{allPagesVerified:boolean;codeScopeVerified:boolean;amountBasisVerified:boolean};options:{aliases:Record<string,string>;gameMappings:GameMapping[];requireGameMapping:boolean}};
const integer=(n:unknown,min=0)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=min;
const label=(s:unknown,max=120)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
export function parseCashierInput(b:any):CashierInput{
 if(!b||!label(b.sourceId,200)||!b.statement)throw Error('원본 식별자와 정산서가 필요합니다.');
 const s=b.statement;
 const stamp=typeof s.date==='string'?Date.parse(s.date+'T00:00:00Z'):NaN;
 if(!/^20\d\d-\d\d-\d\d$/.test(s.date)||!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==s.date||s.currency!=='VND'||typeof s.complete!=='boolean')throw Error('영업일·통화·전체 명단 여부를 확인해주세요.');
 if(!Array.isArray(s.entries)||!s.entries.length||s.entries.length>3000||!integer(s.totalBuyins)||!integer(s.totalAmount))throw Error('정산서 명단과 합계를 확인해주세요.');
 const entries=s.entries.map((e:any)=>{
  if(!e||!label(e.player)||!/[A-Za-z0-9]/.test(e.player)||!integer(e.game,1)||!integer(e.buyins,1)||!integer(e.amount)||(e.table!==undefined&&!/^\d+(?:-\d+)?$/.test(e.table)))throw Error('선수별 게임번호·바이인·금액을 확인해주세요.');
  return {player:e.player.trim(),game:e.game,buyins:e.buyins,amount:e.amount,...(e.table?{table:e.table}:{})};
 });
 const o=b.options||{},aliases:Record<string,string>=Object.create(null);
 if(o.aliases&&(!['object'].includes(typeof o.aliases)||Array.isArray(o.aliases)||Object.keys(o.aliases).length>500))throw Error('별칭 명단을 확인해주세요.');
 for(const [k,v] of Object.entries(o.aliases||{})){if(!/^[A-Z0-9]{1,120}$/.test(k)||!label(v))throw Error('별칭 표기를 확인해주세요.');aliases[k]=v as string;}
 const maps=o.gameMappings||[];
 if(!Array.isArray(maps)||maps.length>300||maps.some((m:any)=>!m||m.date!==s.date||!integer(m.printedGame,1)||!integer(m.game,1)))throw Error('날짜별 게임번호 대응을 확인해주세요.');
 return {sourceId:b.sourceId.trim(),statement:{date:s.date,currency:'VND',complete:s.complete,entries,totalBuyins:s.totalBuyins,totalAmount:s.totalAmount},evidence:{allPagesVerified:b.evidence?.allPagesVerified===true,codeScopeVerified:b.evidence?.codeScopeVerified===true,amountBasisVerified:b.evidence?.amountBasisVerified===true},options:{aliases,gameMappings:maps.map((m:any)=>({date:m.date,printedGame:m.printedGame,game:m.game})),requireGameMapping:o.requireGameMapping!==false}};
}
export function reportChunks(text:string,max=3500){
 const chunks:string[]=[];let current='';
 for(const line of text.split('\n')){
  if(line.length>max)throw Error('보고 항목이 너무 깁니다.');
  if(current.length+line.length+1>max){chunks.push(current);current='';}
  current+=(current?'\n':'')+line;
 }
 if(current)chunks.push(current);return chunks;
}
