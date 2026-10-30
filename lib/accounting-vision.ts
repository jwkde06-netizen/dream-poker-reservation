import {defaultAgency} from './accounting-workflow';
import {bindPaperHeaders} from './accounting-corrections';
import {norm,serial,tableLabel} from './accounting-plan';
import {correctedOperations,playerIdentity,canonicalPlayers,attendancePlayers} from './accounting-context';

// Bind each independent paper to exactly one extraction group. Never borrow
// a name/chip row from another game, even when the same player appears twice.
function paperFor(op:any,documents:any[]){
 const matches=documents.filter(d=>!d.headerAmbiguous&&d.date===op.date&&d.table===(op.confirmedPaperTable??op.table)&&
  (op.gameConfirmed===true&&Number.isInteger(op.printedGame)?d.printedGame===op.printedGame:
   Number.isInteger(d.handwrittenGame)&&d.handwrittenGame>0?d.handwrittenGame===op.game:
   Number.isInteger(op.printedGame)?d.printedGame===op.printedGame:d.printedGame===op.game));
 return matches.length===1?matches[0]:null;
}
function groupedPapers(ops:any[],evidence:any,run:(ops:any[],paper:any)=>any){
 const documents=Array.isArray(evidence.documents)?evidence.documents.map(bindPaperHeaders):evidence.documents;
 if(!Array.isArray(documents)||!documents.length||documents.length>6)return {operations:ops.filter(o=>!['add','total'].includes(o.kind)),withheldOperations:[],questions:['사진의 게임별 명단을 확인하지 못했어요.']};
 const groups=new Map<any,any[]>(),operations=ops.filter(o=>!['add','total'].includes(o.kind)),questions:string[]=[],withheldOperations:any[]=[];
 for(const op of ops.filter(o=>['add','total'].includes(o.kind))){
  const exact=paperFor(op,documents);
  // Repair a uniquely identified paper's handwritten table; preserve confirmed game numbers.
  const candidates=!exact&&op.kind==='add'&&Number.isInteger(op.printedGame)
   ?documents.filter(d=>!d.headerAmbiguous&&d.date===op.date&&(d.table===op.table||d.printedTable===op.table)&&d.printedGame===op.printedGame&&((Number.isInteger(d.handwrittenGame)&&d.handwrittenGame>0&&!op.gameConfirmed)||(Number.isInteger(d.table)&&d.table>0&&d.table!==op.table))):[];
  const paper=exact||(candidates.length===1?candidates[0]:null);
  const bound=paper&&!exact?{...op,table:paper.table,game:op.gameConfirmed?op.game:paper.handwrittenGame||op.game}:op;
  if(!paper){questions.push(`${op.game}번 게임의 용지 번호를 확인해주세요.`);continue;}
  groups.set(paper,[...(groups.get(paper)||[]),bound]);
 }
 for(const paper of documents){
  const group=groups.get(paper);
  if(!group){questions.push(`${paper.handwrittenGame||paper.printedGame||''}번 게임 명단을 다시 확인해야 해요.`);continue;}
  const result=run(group,paper);operations.push(...result.operations);questions.push(...result.questions);withheldOperations.push(...(result.withheldOperations||[]));
 }
 return {operations,withheldOperations,questions:Array.from(new Set(questions))};
}


// Only explicit named standing exclusions are considered. Agency/nationality
// alone never excludes a player.
export function photoPlayerExcluded(player:string,rules:any[]=[]){
 return rules.some(r=>{
  const content=String(r.content||'');
  if(!norm(content).includes(norm(player)))return false;
  return /이 선수는 우리 정산 코드 대상이 아니므로/.test(content);
 });
}

// Reconcile every independently transcribed seat against the master, rather
// than trusting the first model to have included every eligible player.
export function completePhotoRoster(ops:any[],evidence:any,master:any[][],rules:any[]=[]){
 if(evidence?.documents!==undefined)return groupedPapers(ops,evidence,(group,paper)=>completePhotoRoster(group,paper,master,rules));
 const names=evidence?.names,amounts=evidence?.chipAmounts,selected=evidence?.selected;
 const attendance=ops.filter(o=>['add','total'].includes(o.kind));
 const groups=new Set(attendance.map(o=>[o.date,o.game,o.table,o.blind].join('|')));
 const question='저장된 사진의 명단을 정확히 확인하지 못했어요. 해당 사진에 답장으로 확인할 선수와 바이인 수를 알려주세요.';
 if(!Array.isArray(names)||!Array.isArray(amounts)||!Array.isArray(selected)||names.length<1||names.length>10||names.length!==amounts.length||names.length!==selected.length||selected.some((v:any)=>typeof v!=='boolean')||groups.size!==1||typeof evidence.hasSelectionMarkers!=='boolean'||(evidence.crossedOut!==undefined&&(!Array.isArray(evidence.crossedOut)||evidence.crossedOut.length!==names.length||evidence.crossedOut.some((v:any)=>typeof v!=='boolean'))))return {operations:ops.filter(o=>!['add','total'].includes(o.kind)),withheldOperations:[],questions:[question]};
 const operations=ops.filter(o=>!['add','total'].includes(o.kind)),questions:string[]=[],withheldOperations:any[]=[];
 const identities=names.map((name:any,i:number)=>typeof name==='string'&&evidence.crossedOut?.[i]!==true?playerIdentity(name,rules):null);
 const duplicated=new Set(identities.filter((id:any,i:number)=>id&&identities.indexOf(id)!==i));
 for(let i=0;i<names.length;i++){
  if(Array.isArray(evidence.crossedOut)&&evidence.crossedOut[i]===true)continue;
  if(typeof names[i]!=='string'||!names[i].trim()){if(selected[i])questions.push(question);continue;}
  const candidate=correctedOperations([{...attendance[0],player:names[i],chips:amounts[i],buyins:amounts[i]/100000}],'',master,rules)[0];
  const matches=attendancePlayers(master).filter(r=>norm(r[0])===norm(candidate.player));
  if(matches.length!==1||!String(matches[0][2]||'').trim()){if(!evidence.hasSelectionMarkers||!selected[i])continue;questions.push(`${names[i]}님 명단의 이름과 소속을 확인해주세요.`);continue;}
  candidate.player=matches[0][0];
  if(photoPlayerExcluded(candidate.player,rules))continue;
  if(duplicated.has(playerIdentity(candidate.player,rules))){if(!withheldOperations.some(o=>norm(o.player)===norm(candidate.player)))withheldOperations.push(candidate);questions.push(`${candidate.player}님 이름이 사진에서 중복으로 읽혔어요. 누적 바이인 수를 확인해주세요.`);continue;}
  if(!Number.isSafeInteger(amounts[i])||amounts[i]<100000||amounts[i]>5000000||amounts[i]%100000!==0){withheldOperations.push(candidate);questions.push(`${candidate.player}님 누적 바이인 수만 확인해주세요.`);continue;}
  if(!operations.some(o=>['add','total'].includes(o.kind)&&norm(o.player)===norm(candidate.player)))operations.push({...candidate,...attendance.find(o=>norm(o.player)===norm(candidate.player)),masterVerified:true});
 }
 return {operations,withheldOperations,questions:Array.from(new Set(questions))};
}

export function confirmChipCount(text:string,previous:any){
 const match=text.trim().match(/^(?:(?:총|누적)\s*)?(\d{1,2})\s*(?:바인)?(?:이에요|입니다|이야)?[.!]?$/);
 const count=match?Number(match[1]):0;
 if(count<1||count>50||!/(?:누적.*바이?인|총 몇 바인)/.test(previous?.plan?.pendingQuestion||''))return null;
 const candidates=(previous?.plan?.unverifiedOperations||[]).filter((o:any)=>['add','total'].includes(o.kind)&&norm(previous.plan.pendingQuestion).includes(norm(o.player)));
 if(candidates.length!==1)return null;
 return {...candidates[0],buyins:count,chips:count*100000};
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
  if(op.masterVerified!==true&&matched.length===1&&evidence.hasSelectionMarkers===true&&Array.isArray(evidence.selected)&&evidence.selected.length===names.length&&evidence.selected.every((v:any)=>typeof v==='boolean')&&evidence.selected[matched[0].i]===false)continue;
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

/** Bind an affirmative reply only to the exact pending rebuy/table question.
 * Preserve the ledger game/table; the printed paper has its own identifiers.
 */
function rebuyQuestionTarget(question:string,games:any[]){
 // The question is generated prose. Support the observed Korean wording as
 // well as the original template, but never infer a mapping from No.X alone.
 const text=String(question||'').trim().replace(/^네, 확인했습니다\.\s*/, '');
 const legacy=text.match(/^사진의 Table (\d+) 명단은 기존 (\d+)번 게임\((\d+(?:-\d+)?)\)의 리바인 명단이 맞나요\?$/);
 const korean=text.match(/^종이에는 (\d+)번 테이블로 나오는데, 기존 (\d+)번 게임\((\d+(?:-\d+)?)번 테이블\)의 리바인 명단이 맞나요\?$/);
 const match=legacy||korean;if(!match)return null;
 const paperTable=Number(match[1]),game=Number(match[2]),label=match[3];
 if(!Number.isSafeInteger(paperTable)||paperTable<1||!Number.isSafeInteger(game)||game<1)return null;
 const targets=games.filter(g=>g.gameNumber===game&&(korean&&!label.includes('-')?g.tableNumber===Number(label):String(g.tableLabel)===label));
 // A physical table may have multiple sessions or days: confirmation does
 // not authorize choosing between them.
 return targets.length===1?{target:targets[0],paperTable}:null;
}
export function bindConfirmedRebuy(ops:any[],evidence:any,text:string,question:string,games:any[]){
 if(!/^(네|예|넵|맞아|맞아요|맞습니다|응|ㅇㅇ)[.!\s]*$/.test(text.trim()))return ops;
 const mapping=rebuyQuestionTarget(question,games);if(!mapping)return ops;
 const {target,paperTable}=mapping,game=target.gameNumber;
 const papers=(evidence?.documents||[]).filter((p:any)=>!p.headerAmbiguous&&p.date===target.date&&p.table===paperTable);
 if(papers.length!==1)return ops;
 const paper=papers[0];
 return ops.map(op=>{
  if(!['add','total'].includes(op.kind)||op.date!==target.date||op.game!==game||op.table!==target.tableNumber)return op;
  if(!target.players.some((p:any)=>norm(p.name)===norm(op.player)))return op;
  if(!(paper.names||[]).some((n:any)=>norm(n)===norm(op.player)))return op;
  return {...op,kind:'total',gameConfirmed:true,printedGame:paper.printedGame,confirmedPaperTable:paperTable};
 });
}

export function confirmedRebuyContext(text:string,previous:any,games:any[]){
 const saved=previous?.plan?.confirmedRebuy;
 const question=saved?.question||previous?.plan?.pendingQuestion||'';
 if(!saved&&!/^(네|예|넵|맞아|맞아요|맞습니다|응|ㅇㅇ)[.!\s]*$/.test(text.trim()))return null;
 // A new explicit game/table correction must be interpreted afresh.
 if(saved&&/\d+\s*번|테이블|아니|취소/.test(text))return null;
 const mapping=rebuyQuestionTarget(question,games);if(!mapping)return null;
 const {target,paperTable}=mapping;
 if(saved&&(saved.date!==target.date||saved.table!==target.tableNumber))return null;
 return {question,date:target.date,game:target.gameNumber,table:target.tableNumber,paperTable,confirmedByMessageId:saved?.confirmedByMessageId||null};
}


// Bind a later snapshot to the original verified paper and its stable table
// session. Player overlap alone cannot merge a new game into an older game.
export function bindRebuyHistory(ops:any[],evidence:any,games:any[],history:any[],rules:any[]=[]){
 const documents=evidence?.documents;
 if(!Array.isArray(documents))return ops;
 const identity=(n:any)=>playerIdentity(n,rules);
 return ops.map(op=>{
  if(!['add','total'].includes(op.kind))return op;
  const papers=documents.filter((p:any)=>!p.headerAmbiguous&&p.date===op.date&&p.table===op.table&&
   (p.printedGame===op.printedGame||op.printedGame==null&&p.printedGame===op.game));
  if(papers.length!==1)return op;
  const paper=papers[0];
  if(paper.handwrittenGame&&paper.handwrittenGame!==paper.printedGame)return op;
  const names=new Set((paper.names||[]).filter((n:any,i:number)=>n&&paper.crossedOut?.[i]!==true).map(identity));
  const candidates=new Map<string,{game:any;source:number}>();
  for(const job of history){
   if(job.status!=='applied'||job.plan?.pendingQuestion||job.plan?.manual_handoff||job.plan?.reconciliation)continue;
   const prior=(job.plan?.chipVerification?.documents||[]).filter((p:any)=>p.date===paper.date&&p.table===paper.table&&p.printedGame===paper.printedGame&&!p.headerAmbiguous);
   if(prior.length!==1)continue;
   const priorNames=new Set((prior[0].names||[]).filter(Boolean).map(identity));
   const shared=Array.from(names).filter(n=>priorNames.has(n));
   if(shared.length<2)continue;
   const original=(job.plan?.operations||[]).filter((o:any)=>['add','total'].includes(o.kind)&&o.date===paper.date&&o.table===paper.table&&o.printedGame===paper.printedGame);
   const labels=new Set((job.plan?.sheetState?.entries||[]).filter((e:any)=>original.some((o:any)=>o.date===e.date&&o.game===e.game&&o.blind===e.blind&&identity(o.player)===identity(e.player))&&Number(String(e.tableLabel).split('-')[0])===paper.table).map((e:any)=>e.tableLabel));
   for(const label of Array.from(labels)){
    const matches=games.filter(g=>g.date===paper.date&&g.tableLabel===label&&g.tableNumber===paper.table&&g.blind===op.blind);
    if(matches.length!==1)continue;
    const game=matches[0];
    if(game.players.filter((p:any)=>names.has(identity(p.name))&&priorNames.has(identity(p.name))).length<2)continue;
    candidates.set([game.date,game.gameNumber,game.tableLabel,game.blind].join('|'),{game,source:job.message_id});
   }
  }
  if(candidates.size!==1)return op;
  const match=Array.from(candidates.values())[0],game=match.game;
  if(op.gameConfirmed&&op.game!==game.gameNumber)return op;
  if(op.game!==paper.printedGame&&op.game!==game.gameNumber)return op;
  const existing=game.players.filter((p:any)=>identity(p.name)===identity(op.player));
  if(existing.length>1)return op;
  return {...op,game:game.gameNumber,gameConfirmed:true,kind:existing.length?'total':'add',
   rebuyBinding:{sourceMessageId:match.source,printedGame:paper.printedGame,tableLabel:game.tableLabel,reason:'verified_paper_and_live_session'}};
 });
}


// Absence from a later, positively bound rebuy roster does not cancel attendance.
export function missingRebuyPlayers(ops:any[],evidence:any,games:any[],rules:any[]=[]){
 const missing:any[]=[];
 for(const op of ops){
  if(!op.rebuyBinding)continue;
  const targets=games.filter(g=>g.date===op.date&&g.gameNumber===op.game&&g.tableLabel===op.rebuyBinding.tableLabel&&g.blind===op.blind);
  const papers=(evidence?.documents||[]).filter((p:any)=>!p.headerAmbiguous&&p.date===op.date&&p.table===op.table&&p.printedGame===op.rebuyBinding.printedGame);
  if(targets.length!==1||papers.length!==1)continue;
  const paper=papers[0],names=new Set((paper.names||[]).filter(Boolean).map((n:any)=>playerIdentity(n,rules)));
  for(const player of targets[0].players){
   if(names.has(playerIdentity(player.name,rules)))continue;
   if(missing.some(p=>p.date===op.date&&p.game===op.game&&p.table===op.table&&playerIdentity(p.player,rules)===playerIdentity(player.name,rules)))continue;
   missing.push({...op,kind:'total',player:player.name,buyins:player.buyins,chips:null,possibleBustOut:true});
  }
 }
 return missing;
}
export function missingRebuyQuestion(op:any){
 return op.player+'님이 리바인 명단에서 보이지 않아 버스트아웃했을 가능성이 있어요. 현재 '+op.buyins+'바인으로 기록돼 있는데, TD에게 최종 누적 바이인 수를 확인해주시겠어요?';
}


// Saved staff policy, not nationality, authorizes circled newcomers. Bind a
// first-read operation to exactly one independent paper and matching chip row.
// The approval map is created here, never accepted from model operation fields.
export function prepareSelectedPhotoRegistrations(ops:any[],evidence:any,master:any[][],rules:any[]=[]){
 const approvals:Record<string,{agency:string}>={};
 const registrations:any[]=[];
 const allowed=rules.some(r=>/동그라미|선택/.test(String(r.content||''))&&/명단에.*없/.test(String(r.content||''))&&/신규.*등록/.test(String(r.content||'')));
 const agency=defaultAgency(rules,master);
 const documents=Array.isArray(evidence?.documents)?evidence.documents.map(bindPaperHeaders):[];
 if(!allowed||!agency||documents.length<1||documents.length>6)return {operations:ops,master,approvals};
 for(const op of ops.filter(o=>['add','total'].includes(o.kind))){
  const name=String(op.player||'').trim().toUpperCase(),id=norm(name);
  if(!/^[A-Z][A-Z .'-]{2,79}$/.test(name)||!id||canonicalPlayers(master).some(r=>norm(r[0])===playerIdentity(name,rules))||photoPlayerExcluded(name,rules))continue;
  const paper=paperFor(op,documents);
  if(!paper||paper.hasSelectionMarkers!==true||!Array.isArray(paper.names)||!Array.isArray(paper.chipAmounts)||!Array.isArray(paper.selected)||
   paper.names.length<1||paper.names.length>10||paper.names.length!==paper.chipAmounts.length||paper.names.length!==paper.selected.length||
   paper.selected.some((s:any)=>typeof s!=='boolean')||
   paper.crossedOut!==undefined&&(!Array.isArray(paper.crossedOut)||paper.crossedOut.length!==paper.names.length||paper.crossedOut.some((s:any)=>typeof s!=='boolean')))continue;
  const rows=paper.names.map((n:any,i:number)=>({n,i})).filter((r:any)=>norm(r.n)===id);
  if(rows.length!==1)continue;
  const i=rows[0].i,chips=paper.chipAmounts[i];
  if(paper.selected[i]!==true||paper.crossedOut?.[i]===true||!Number.isSafeInteger(chips)||chips<100000||chips>5000000||chips%100000!==0||op.chips!==chips||op.buyins!==chips/100000)continue;
  // An explicitly extracted alternative agency stays on the named staff path.
  if(ops.some(o=>o.kind==='register'&&norm(o.player)===id&&o.agency&&o.agency!==agency))continue;
  approvals[id]={agency};
  if(!registrations.some(r=>norm(r.player)===id))registrations.push({kind:'register',player:name,agency});
 }
 const operations=[...ops.filter(o=>o.kind!=='register'||!approvals[norm(o.player)]),...registrations].map(o=>
  ['add','total'].includes(o.kind)&&approvals[norm(o.player)]?{...o,kind:'add'}:o);
 return {operations,master:[...master,...registrations.map(r=>[r.player,'',r.agency])],approvals};
}
