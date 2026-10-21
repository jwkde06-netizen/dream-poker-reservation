import {norm,tableLabel,serial} from './accounting-plan';

// A manager's saved default applies only to explicitly named registrations.
// It never assigns a code by nationality or changes an existing nonempty code.
export function defaultAgency(rules:any[],master:any[][]){
 const codes=new Set(master.slice(1).map(r=>String(r[2]||'')).filter(Boolean));
 for(const rule of [...rules].reverse()){
  const text=String(rule.content||'');
  if(!/(기본값|기본\s*코드|별다른.*없으면)/.test(text))continue;
  const tokens=text.toUpperCase().match(/[A-Z]+[0-9]*(?:\([A-Z]+\))?/g)||[];
  const found=Array.from(new Set(tokens.filter(c=>codes.has(c))));
  if(found.length===1)return found[0];
 }
 return null;
}
export function withDefaultAgency(ops:any[],rules:any[],master:any[][],evidence:string){
 const fallback=defaultAgency(rules,master);
 return (ops||[]).map(op=>{
  if(op.kind!=='register'||op.agency||!fallback||!norm(evidence).includes(norm(op.player)))return op;
  const matches=master.slice(1).filter(r=>norm(r[0])===norm(op.player));
  const codes=Array.from(new Set(matches.map(r=>r[2]).filter(Boolean)));
  if(codes.length>1)return op;
  return {...op,agency:codes[0]||fallback};
 });
}

// A narrow deterministic continuation for an explicitly named, seated newcomer
// whose only missing fact was agency. No inference from nationality or old photos.
export function completeNamedArrival(ops:any[],evidence:string,daily:any[][],master:any[][],rules:any[],date:string,previous?:any){
 const output=withDefaultAgency(ops,rules,master,evidence);
 if(!/신규\s*(플레이어|선수)|신규\s*등록/.test(evidence)||!/착석|참가|참여|합류/.test(evidence))return output;
 const refs=Array.from(evidence.matchAll(/(?:^|\s)(\d{1,2})\s*-\s*(\d{1,2})(?:\s*게임|\s*테이블|\s|$)/g)).map(m=>m[1]+'-'+m[2]);
 if(new Set(refs).size!==1)return output;
 const registrations=[...output,...(previous?.plan?.operations||[])].filter(o=>o.kind==='register'&&norm(evidence).includes(norm(o.player)));
 const names=Array.from(new Set(registrations.map(o=>o.player)));if(names.length!==1)return output;
 const player=names[0],known=master.slice(1).filter(r=>norm(r[0])===norm(player));
 const explicitCodes=(evidence.toUpperCase().match(/[A-Z]+[0-9]*(?:\([A-Z]+\))?/g)||[]).filter(c=>master.some(r=>r[2]===c));
 const codes=Array.from(new Set(explicitCodes));
 const agency=known.find(r=>r[2])?.[2]||(codes.length===1?codes[0]:defaultAgency(rules,master));if(!agency)return output;
 let game=0;const sessions:any[]=[];
 for(const row of daily.slice(1)){if(row[0]!==''&&row[0]!=null)game=Number(row[0]);if(row[4]&&Number(row[1])===serial(date)&&tableLabel(row[2])===refs[0])sessions.push({game,blind:row[3]});}
 if(!sessions.length||new Set(sessions.map(s=>s.game+'|'+s.blind)).size!==1)return output;
 if(!output.some(o=>o.kind==='register'&&norm(o.player)===norm(player)))output.unshift({kind:'register',player,agency});
 else for(const o of output)if(o.kind==='register'&&norm(o.player)===norm(player)&&!o.agency)o.agency=agency;
 if(!output.some(o=>['add','total','cancel'].includes(o.kind)&&norm(o.player)===norm(player))){
  const quantities=Array.from(evidence.matchAll(/(\d+)\s*바인/g)).map(m=>Number(m[1]));
  if(quantities.length>1)return output;
  output.push({kind:'add',date,game:sessions[0].game,table:Number(refs[0].split('-')[0]),blind:sessions[0].blind,player,buyins:quantities[0]||1});
 }
 return output;
}

export function cosmeticNameEdit(before:string,after:string){
 // Only the short Korean name before an unchanged English registration can
 // differ. Amounts, instructions, English identity and photo edits never qualify.
 const split=(s:string)=>s.match(/^([가-힣]{2,5})\s+([A-Z][\s\S]+)$/);
 const a=split(before),b=split(after);
 return !!a&&!!b&&a[2]===b[2]&&/신규\s*(플레이어|선수)|신규\s*등록/.test(a[2]);
}

export function resolvePendingJobs(jobs:any[]){
 const resolved=new Set(jobs.filter(j=>j.status==='applied'&&!j.plan?.pendingQuestion).map(j=>j.plan?.contextMessageId).filter(Boolean));
 return jobs.filter(j=>['review','failed','uncertain','writing'].includes(j.status)||(j.status==='applied'&&j.plan?.pendingQuestion)).filter(j=>!resolved.has(j.message_id)&&!j.plan?.manual_handoff&&!j.plan?.reconciliation&&!j.plan?.resolvedBy);
}
export function jobReport(jobs:any[]){
 const counts:Record<string,number>={};for(const j of jobs)counts[j.status]=(counts[j.status]||0)+1;
 const durations=jobs.map(j=>j.plan?.metrics?.durationMs).filter(Number.isFinite).sort((a,b)=>a-b);
 const usage=jobs.reduce((sum,j)=>sum+Number(j.plan?.metrics?.totalTokens||0),0);
 return {total:jobs.length,statusCounts:counts,pending:resolvePendingJobs(jobs).map(j=>({messageId:j.message_id,text:j.text,question:j.plan?.pendingQuestion||j.reply_text,status:j.status})),missingReplies:jobs.filter(j=>j.reply_text&&!j.reply_id).map(j=>j.message_id),measuredRequests:durations.length,p50Ms:durations.length?durations[Math.floor((durations.length-1)*.5)]:null,p95Ms:durations.length?durations[Math.ceil((durations.length-1)*.95)]:null,recordedTokens:usage};
}
