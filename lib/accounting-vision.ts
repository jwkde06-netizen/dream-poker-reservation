import {bindPaperHeaders} from './accounting-corrections';
import {norm,serial,tableLabel} from './accounting-plan';
import {correctedOperations,playerIdentity,canonicalPlayers} from './accounting-context';

// Bind each independent paper to exactly one extraction group. Never borrow
// a name/chip row from another game, even when the same player appears twice.
function paperFor(op:any,documents:any[]){
 const matches=documents.filter(d=>d.date===op.date&&d.table===op.table&&
  (op.gameConfirmed===true&&Number.isInteger(op.printedGame)?d.printedGame===op.printedGame:
   Number.isInteger(d.handwrittenGame)&&d.handwrittenGame>0?d.handwrittenGame===op.game:
   Number.isInteger(op.printedGame)?d.printedGame===op.printedGame:d.printedGame===op.game));
 return matches.length===1?matches[0]:null;
}
function groupedPapers(ops:any[],evidence:any,run:(ops:any[],paper:any)=>any){
 const documents=Array.isArray(evidence.documents)?evidence.documents.map(bindPaperHeaders):evidence.documents;
 if(!Array.isArray(documents)||!documents.length||documents.length>6)return {operations:ops.filter(o=>!['add','total'].includes(o.kind)),questions:['사진의 게임별 명단을 확인하지 못했어요.']};
 const groups=new Map<any,any[]>(),operations=ops.filter(o=>!['add','total'].includes(o.kind)),questions:string[]=[];
 for(const op of ops.filter(o=>['add','total'].includes(o.kind))){
  const exact=paperFor(op,documents);
  // Repair only an unconfirmed new-game number on a uniquely identified paper.
  const candidates=!exact&&op.kind==='add'&&!op.gameConfirmed&&Number.isInteger(op.printedGame)
   ?documents.filter(d=>d.date===op.date&&d.table===op.table&&d.printedGame===op.printedGame&&Number.isInteger(d.handwrittenGame)&&d.handwrittenGame>0):[];
  const paper=exact||(candidates.length===1?candidates[0]:null);
  const bound=paper&&!exact?{...op,game:paper.handwrittenGame}:op;
  if(!paper){questions.push(`${op.game}번 게임의 용지 번호를 확인해주세요.`);continue;}
  groups.set(paper,[...(groups.get(paper)||[]),bound]);
 }
 for(const paper of documents){
  const group=groups.get(paper);
  if(!group){questions.push(`${paper.handwrittenGame||paper.printedGame||''}번 게임 명단을 다시 확인해야 해요.`);continue;}
  const result=run(group,paper);operations.push(...result.operations);questions.push(...result.questions);
 }
 return {operations,questions:Array.from(new Set(questions))};
}

// Reconcile every independently transcribed seat against the master, rather
// than trusting the first model to have included every eligible player.
export function completePhotoRoster(ops:any[],evidence:any,master:any[][],rules:any[]=[]){
 if(evidence?.documents!==undefined)return groupedPapers(ops,evidence,(group,paper)=>completePhotoRoster(group,paper,master,rules));
 const names=evidence?.names,amounts=evidence?.chipAmounts,selected=evidence?.selected;
 const attendance=ops.filter(o=>['add','total'].includes(o.kind));
 const groups=new Set(attendance.map(o=>[o.date,o.game,o.table,o.blind,o.kind].join('|')));
 const question='사진의 선수 표시를 모두 확인하지 못했어요. 원본 명단 사진을 다시 올려주시겠어요?';
 if(!Array.isArray(names)||!Array.isArray(amounts)||!Array.isArray(selected)||names.length<1||names.length>10||names.length!==amounts.length||names.length!==selected.length||selected.some((v:any)=>typeof v!=='boolean')||groups.size!==1||typeof evidence.hasSelectionMarkers!=='boolean')return {operations:ops,questions:[question]};
 const operations=[...ops],questions:string[]=[];
 for(let i=0;i<names.length;i++){
  if(!selected[i])continue;
  if(typeof names[i]!=='string'||!names[i].trim()){questions.push(question);continue;}
  const candidate=correctedOperations([{...attendance[0],player:names[i],chips:amounts[i],buyins:amounts[i]/100000}],'',master,rules)[0];
  const matches=canonicalPlayers(master).filter(r=>norm(r[0])===norm(candidate.player));
  if(matches.length!==1||!String(matches[0][2]||'').trim()){if(!evidence.hasSelectionMarkers)continue;questions.push(`${names[i]}님 명단의 이름과 소속을 확인해주세요.`);continue;}
  if(!Number.isSafeInteger(amounts[i])||amounts[i]<100000||amounts[i]>5000000||amounts[i]%100000!==0){questions.push(`${candidate.player}님 누적 바이인 수만 확인해주세요.`);continue;}
  if(!operations.some(o=>['add','total'].includes(o.kind)&&norm(o.player)===norm(candidate.player)))operations.push(candidate);
 }
 return {operations,questions:Array.from(new Set(questions))};
}

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
 if(evidence?.documents!==undefined)return groupedPapers(ops,evidence,(group,paper)=>verifyChipEvidence(group,paper,rules));
 const names=evidence?.names,amounts=evidence?.chipAmounts;
 if(!Array.isArray(names)||!Array.isArray(amounts)||names.length!==amounts.length||names.length<1||names.length>10)return {operations:ops.filter(o=>!['add','total'].includes(o.kind)),questions:['사진의 이름과 칩 수를 정확히 맞추지 못했어요. 누적 바이인 수를 확인해주세요.']};
 const canonical=(name:string)=>playerIdentity(name,rules);
 const questions:string[]=[],operations:any[]=[];
 for(const op of ops){
  if(!['add','total'].includes(op.kind)){operations.push(op);continue;}
  const matched=names.map((name:any,i:number)=>({name,i})).filter((r:any)=>typeof r.name==='string'&&canonical(r.name)===canonical(op.player));
  // Explicit seat selection from independent transcription excludes unselected rows.
  // Keep the stricter count comparison for every selected player.
  if(matched.length===1&&evidence.hasSelectionMarkers===true&&Array.isArray(evidence.selected)&&evidence.selected.length===names.length&&evidence.selected.every((v:any)=>typeof v==='boolean')&&evidence.selected[matched[0].i]===false)continue;
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
