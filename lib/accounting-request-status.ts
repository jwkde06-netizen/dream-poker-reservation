import {playerIdentity,canonicalPlayers} from './accounting-context';

// Read-only comparison. A historic error is not evidence of a missing ledger row.
export function requestSheetStatus(jobs:any[],games:any[],master:any[][],fnb:any[][],scope:{replyId?:number;game?:number}={}){
 const byId=new Map<number,any>();
 for(const j of [...jobs].sort((a,b)=>Number(b.update_id||b.message_id)-Number(a.update_id||a.message_id)))if(!byId.has(j.message_id))byId.set(j.message_id,j);
 const root=(j:any)=>{
  const seen=new Set<number>();let current=j;
  while(current&&!seen.has(current.message_id)){
   seen.add(current.message_id);
   const parent=byId.get(current.plan?.contextMessageId)||byId.get(current.plan?.photoSourceMessageId);
   if(!parent||parent.message_id===current.message_id)break;current=parent;
  }
  return current?.message_id||j.message_id;
 };
 let selected=Array.from(byId.values());
 if(scope.replyId){const match=selected.find(j=>j.message_id===scope.replyId||j.reply_id===scope.replyId);selected=match?selected.filter(j=>root(j)===root(match)):[];}
 const latest=new Map<number,any>();
 for(const j of selected){
  if(j.plan?.referenceOnly||j.plan?.casualConversation)continue;
  if(j.status==='ignored'&&!j.plan?.manual_handoff&&!j.plan?.resolvedBy)continue;
  const id=root(j);if(!latest.has(id))latest.set(id,j);
 }
 let requests=Array.from(latest.values());
 if(scope.game)requests=requests.filter(j=>[...(j.plan?.operations||[]),...(j.plan?.unverifiedOperations||[])].some(o=>o.game===scope.game));
 const equal=(op:any)=>{
  if(op.kind==='register'){const found=canonicalPlayers(master).filter(r=>playerIdentity(r[0])===playerIdentity(op.player));return found.length===1&&(!op.agency||found[0][2]===op.agency)&&(!op.card||String(found[0][1])===String(op.card));}
  if(op.kind==='fnb')return false; // No stable expense identity: never infer completion from equal totals.
  if(!['add','total','cancel'].includes(op.kind))return false;
  const target=games.filter(g=>g.date===op.date&&g.gameNumber===op.game&&g.tableNumber===op.table&&g.blind===op.blind);
  if(target.length!==1)return false;
  const rows=target[0].players.filter((p:any)=>playerIdentity(p.name)===playerIdentity(op.player));
  return op.kind==='cancel'?rows.length===0:rows.length===1&&rows[0].buyins===op.buyins;
 };
 const counts={complete:0,pending:0,failed:0,processing:0,manual:0};
 for(const j of requests){
  const p=j.plan||{},ops=p.operations||[];
  if(p.manual_handoff){counts.manual++;continue;}
  if(['received','processing','writing'].includes(j.status)){counts.processing++;continue;}
  if(j.status==='failed'){counts.failed++;continue;}
  if(j.status==='applied'&&!p.pendingQuestion&&!p.unverifiedOperations?.length&&ops.length&&ops.every(equal)){counts.complete++;continue;}
  counts.pending++;
 }
 if(!requests.length)return '대조할 요청을 찾지 못했어요. 확인할 사진에 답장하거나 게임 번호를 알려주세요.';
 const parts=[counts.complete?'반영 확인 '+counts.complete+'건':null,counts.pending?'대조·확인 필요 '+counts.pending+'건':null,counts.failed?'처리 실패 '+counts.failed+'건':null,counts.processing?'처리 중 '+counts.processing+'건':null,counts.manual?'직원 직접 처리 '+counts.manual+'건':null].filter(Boolean);
 return (counts.complete===requests.length?'✅ ':'')+parts.join(' · ')+(counts.pending||counts.failed?'\n확인 필요 건은 누락으로 확정된 것이 아니에요.':'');
}
