import {norm,tableLabel} from './accounting-plan';
import {isoDate} from './settlement-domain';

// Read the receipt chain once. Retry logs and short answers are not new scans.
export function settlementIntake(jobs:any[],daily:any[][],master:any[][],start:string,end:string){
 const ordered=[...jobs].sort((a,b)=>Number(b.update_id||b.message_id)-Number(a.update_id||a.message_id));
 const byId=new Map<number,any>();for(const j of ordered)if(!byId.has(j.message_id))byId.set(j.message_id,j);
 const root=(j:any)=>{const seen=new Set<number>();let current=j;while(current&&!seen.has(current.message_id)){seen.add(current.message_id);const parent=byId.get(current.plan?.contextMessageId)||byId.get(current.plan?.photoSourceMessageId);if(!parent||parent.message_id===current.message_id)break;current=parent;}return current?.message_id||j.message_id;};
 const latest=new Map<number,any>();
 for(const j of byId.values()){
  const p=j.plan||{};
  if(p.referenceOnly||p.casualConversation||p.resolvedBy||p.reconciliation)continue;
  if(j.status==='ignored'&&!p.manual_handoff)continue;
  if(!p.manual_handoff&&!j.source_message?.photo&&!j.source_message?.document&&!p.photoSourceMessageId&&!p.operations?.length&&!p.unverifiedOperations?.length&&!p.pendingQuestion)continue;
  const id=root(j);if(!latest.has(id))latest.set(id,j);
 }
 const entries:any[]=[];let game:number|null=null,lastDate:string|null=null;
 for(const row of daily.slice(1)){const date=isoDate(row[1]);if(date&&date!==lastDate){game=null;lastDate=date;}if(row[0]!==''&&row[0]!=null)game=Number(row[0]);if(row[4])entries.push({date,game,table:Number(tableLabel(row[2]).split('-')[0]),blind:row[3],player:norm(row[4]),buyins:row[7]});}
 const matches=(op:any)=>{
  if(op.kind==='register'){const rows=master.slice(1).filter(r=>norm(r[0])===norm(op.player));return rows.length===1&&(!op.agency||rows[0][2]===op.agency)&&(!op.card||String(rows[0][1])===String(op.card));}
  if(!['add','total','cancel'].includes(op.kind))return false;
  const rows=entries.filter(r=>r.date===op.date&&r.game===op.game&&r.table===op.table&&r.blind===op.blind&&r.player===norm(op.player));
  return op.kind==='cancel'?entries.some(r=>r.date===op.date&&r.game===op.game&&r.table===op.table)&&rows.length===0:rows.length===1&&Number(rows[0].buyins)===op.buyins;
 };
 const items=Array.from(latest.values()).flatMap(j=>{
  const p=j.plan||{},ops=p.operations||[],all=[...ops,...(p.unverifiedOperations||[])];
  const dates=Array.from(new Set<string>(all.map(o=>isoDate(o.date)).filter(Boolean)));
  const fallback=new Date(j.created_at||0);const date=dates[0]||(!Number.isNaN(fallback.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(fallback):'');
  const relevant=(dates.length?dates:[date]).filter(d=>d>=start&&d<=end);if(!relevant.length)return [];
  const checked=ops.filter(matches).length;
  // A saved F&B write has its own readback audit; equal expense totals are not an identity.
  const verified=ops.length>0&&ops.every(o=>o.kind==='fnb'?j.status==='applied':matches(o));
  const state=p.manual_handoff?'manual':['received','processing','writing'].includes(j.status)?'processing':!p.pendingQuestion&&!p.unverifiedOperations?.length&&!p.deferredRegistrations?.length&&verified?'verified':j.status==='failed'?'failed':'review';
  return [{messageId:j.message_id,rootMessageId:root(j),date:relevant[0],dates:relevant,games:Array.from(new Set<number>(all.map(o=>o.game).filter(g=>Number.isInteger(g)&&g>0))),players:Array.from(new Set<string>(all.map(o=>String(o.player||'')).filter(Boolean))),status:state,checked,total:ops.length,question:state==='verified'||state==='manual'?null:p.pendingQuestion||(state==='processing'?'사진 내용을 확인하고 있습니다.':state==='failed'?'이 요청은 처리되지 않았어요. 참가 기록과 대조해주세요.':'현재 장부와 이 요청을 대조해주세요.'),createdAt:j.created_at}];
 });
 const counts={verified:0,review:0,failed:0,processing:0,manual:0};for(const i of items)counts[i.status as keyof typeof counts]++;
 return {items,counts,total:items.length};
}

export async function readSettlementJobs(client:any,start:string,end:string){
 // Include next-day uploads of the prior night's receipt; business-date filtering
 // happens after operation dates and follow-up chains have been resolved.
 const until=new Date(end+'T00:00:00+07:00');until.setTime(until.getTime()+2*86400000);
 const jobs:any[]=[];
 for(let offset=0;offset<10000;offset+=500){
  const q=await client.from('dream_accounting_jobs').select('update_id,message_id,text,status,plan,reply_text,reply_id,created_at,source_message').gte('created_at',start+'T00:00:00+07:00').lt('created_at',until.toISOString()).order('update_id').range(offset,offset+499);
  if(q.error)throw Error('스캔 처리 내역을 불러오지 못했어요.');jobs.push(...q.data||[]);if((q.data?.length||0)<500)return jobs;
 }
 throw Error('처리 이력이 많아 전체 대조가 필요해요.');
}
