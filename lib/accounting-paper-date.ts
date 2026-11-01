// Printed receipts can use D/M/YYYY or M/D/YYYY. Preserve the original ink;
// choose an ambiguous order only when a verified context date is a candidate.
const isoDate=(y:number,m:number,d:number)=>{
 if(!Number.isInteger(y)||y<2000||y>2099||!Number.isInteger(m)||m<1||m>12||!Number.isInteger(d)||d<1||d>31)return null;
 const value=new Date(Date.UTC(y,m-1,d));
 return value.getUTCFullYear()===y&&value.getUTCMonth()===m-1&&value.getUTCDate()===d?value.toISOString().slice(0,10):null;
};
export function printedDateCandidates(raw:unknown):string[]{
 if(typeof raw!=='string')return [];
 const text=raw.trim();
 const iso=text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})$/);
 if(iso){const value=isoDate(Number(iso[1]),Number(iso[2]),Number(iso[3]));return value?[value]:[];}
 const date=text.match(/^(\d{1,2})\s*([/.-])\s*(\d{1,2})\s*\2\s*(20\d{2})$/);
 if(!date)return [];
 return Array.from(new Set([isoDate(Number(date[4]),Number(date[3]),Number(date[1])),isoDate(Number(date[4]),Number(date[1]),Number(date[3]))].filter((v):v is string=>!!v)));
}
export function staffReceiptDate(text:string,businessDate:string):string|undefined{
 const dates:string[]=[];
 for(const m of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)){const value=isoDate(Number(m[1]),Number(m[2]),Number(m[3]));if(value)dates.push(value);}
 for(const m of text.matchAll(/(?:(20\d{2})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)){const value=isoDate(Number(m[1]||businessDate.slice(0,4)),Number(m[2]),Number(m[3]));if(value)dates.push(value);}
 const unique=Array.from(new Set(dates));return unique.length===1?unique[0]:undefined;
}
export function normalizePaperDates(evidence:any,businessDate?:string,confirmedDate?:string){
 if(!Array.isArray(evidence?.documents))return evidence;
 return {...evidence,documents:evidence.documents.map((paper:any)=>{
  // Old logs lack a raw date. Do not swap their existing dates speculatively.
  if(paper?.dateRaw===undefined)return paper;
  const candidates=printedDateCandidates(paper.dateRaw);
  const preferred=confirmedDate||businessDate;
  const missing=paper.datePresent===false&&(paper.dateRaw===null||paper.dateRaw==='')&&preferred&&printedDateCandidates(preferred).length===1;
  const resolved=missing?preferred:confirmedDate?(candidates.includes(confirmedDate)?confirmedDate:null):candidates.length===1?candidates[0]:preferred&&candidates.includes(preferred)?preferred:null;
  return {...paper,date:resolved||null,dateCandidates:candidates,dateAmbiguous:!resolved,
   dateResolution:missing?(confirmedDate?'no_print_staff_date':'no_print_business_date'):!resolved?'unresolved':confirmedDate?'staff_confirmed_printed_date':candidates.length===1?'unambiguous_print':'business_date_matches_print'};
 })};
}

// The first reader can swap the same printed month/day as well. Rebind only
// within the current reconciled business day and one exact printed header;
// both the proposed and resolved dates must be interpretations of that ink.
export function bindOperationPaperDates(ops:any[],evidence:any,businessDate:string){
 const documents=Array.isArray(evidence?.documents)?evidence.documents:[];
 return ops.map(op=>{
  if(!['add','total'].includes(op.kind)||!Number.isInteger(op.printedGame))return op;
  const papers=documents.filter((p:any)=>!p.dateAmbiguous&&p.date===businessDate&&typeof p.dateRaw==='string'&&
   p.table===(op.confirmedPaperTable??op.table)&&p.printedGame===op.printedGame&&
   Array.isArray(p.dateCandidates)&&p.dateCandidates.includes(op.date)&&p.dateCandidates.includes(p.date));
  if(papers.length!==1||op.date===papers[0].date)return op;
  const paper=papers[0];
  return {...op,date:paper.date,printedDateBinding:{dateRaw:paper.dateRaw,previousDate:op.date,resolvedDate:paper.date,reason:paper.dateResolution}};
 });
}
