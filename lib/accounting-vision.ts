import {norm,serial,tableLabel} from './accounting-plan';

export function confirmChipCount(text:string,previous:any){
 const match=text.trim().match(/^(?:(?:총|누적)\s*)?(\d{1,2})\s*(?:바인)?(?:이에요|입니다|이야)?[.!]?$/);
 const count=match?Number(match[1]):0;
 if(count<1||count>50||!/(?:누적.*바이?인|총 몇 바인)/.test(previous?.plan?.pendingQuestion||''))return null;
 const candidates=(previous?.plan?.unverifiedOperations||[]).filter((o:any)=>['add','total'].includes(o.kind)&&norm(previous.plan.pendingQuestion).includes(norm(o.player)));
 if(candidates.length!==1)return null;
 return {...candidates[0],kind:'total',buyins:count,chips:count*100000};
}

export function needsChipVerification(ops:any[],daily:any[][]){
 return ops.some(op=>{
  if(!['add','total'].includes(op.kind))return false;
  let game=0;
  return daily.some(r=>{if(r[0]!==''&&r[0]!=null)game=Number(r[0]);return r[4]&&Number(r[1])===serial(op.date)&&game===op.game&&Number(tableLabel(r[2]).split('-')[0])===op.table;});
 });
}
// Compare an independent, context-free column transcription with the first
// reading. No vote or arbitrary confidence score is allowed to decide money.
export function verifyChipEvidence(ops:any[],evidence:any,rules:any[]=[]){
 const names=evidence?.names,amounts=evidence?.chipAmounts;
 if(!Array.isArray(names)||!Array.isArray(amounts)||names.length!==amounts.length||names.length<1||names.length>10)return {operations:ops.filter(o=>!['add','total'].includes(o.kind)),questions:['사진의 이름과 칩 수를 정확히 맞추지 못했어요. 누적 바이인 수를 확인해주세요.']};
 const canonical=(name:string)=>{
  const value=norm(name);
  if(value==='CHANGCALEBYOONHO'&&rules.some(r=>/CHANG CALEB YOON-HO/.test(r.content)&&/CHANG YOON HO/.test(r.content)))return 'CHANGYOONHO';
  return value;
 };
 const questions:string[]=[],operations:any[]=[];
 for(const op of ops){
  if(!['add','total'].includes(op.kind)){operations.push(op);continue;}
  const matched=names.map((name:any,i:number)=>({name,i})).filter((r:any)=>typeof r.name==='string'&&canonical(r.name)===canonical(op.player));
  const chips=matched.length===1?amounts[matched[0].i]:null;
  if(!Number.isSafeInteger(chips)||chips<100000||chips>5000000||chips%100000!==0||chips/100000!==op.buyins){questions.push(`${op.player}님 사진의 누적 바이인 수만 확인해주세요.`);continue;}
  operations.push({...op,chips});
 }
 return {operations,questions};
}

const sameEntry=(a:any,b:any)=>a.date===b.date&&a.game===b.game&&a.table===b.table&&norm(a.player)===norm(b.player);
export function withheldChipOperations(original:any[],verified:any[]){
 return original.filter(o=>['add','total'].includes(o.kind)&&!verified.some(v=>sameEntry(o,v)));
}
export function continueChipConfirmation(text:string,previous:any){
 const confirmed=confirmChipCount(text,previous);if(!confirmed)return null;
 const remaining=(previous.plan.unverifiedOperations||[]).filter((o:any)=>!sameEntry(o,confirmed));
 return {documentType:'paper_game',operations:[confirmed],unverifiedOperations:remaining,question:remaining.length?`${remaining[0].player}님은 총 몇 바인인가요?`:null};
}
