import {canRetryPhoto} from './accounting-ai-response';
import {resolvePendingJobs} from './accounting-workflow';

// Keep identifiers in callback data only. Both status entry points use this view.
export function staffStatus(jobs:any[]){
 const latest=new Map<number,any>();
 for(const job of jobs){const prior=latest.get(job.message_id);if(!prior||Number(job.update_id)>Number(prior.update_id))latest.set(job.message_id,job);}
 const pending=resolvePendingJobs(Array.from(latest.values()));
 const shown=pending.slice(0,8);
 const buttons:any[][]=[];
 const lines=shown.map((job,index)=>{
  const timestamp=job.source_message?.date?Number(job.source_message.date)*1000:Date.parse(job.created_at);
  const time=Number.isFinite(timestamp)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Ho_Chi_Minh',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(timestamp):'시간 확인 필요';
  const photo=!!(job.source_message?.photo||job.source_message?.document);
  const label=`${index+1}. ${time} ${photo?'사진':'메시지'}`;
  const row=[];
  if(canRetryPhoto(job))row.push({text:`${index+1}. 해당 사진 다시 처리`,callback_data:'desk:retry:'+job.message_id});
  if(['review','failed','applied'].includes(job.status))row.push({text:`${index+1}. 직접 입력했어요`,callback_data:'desk:manual:'+job.message_id});
  if(row.length)buttons.push(row);
  const detail=['writing','uncertain'].includes(job.status)?'시트에 일부 기록됐을 수 있어 대조가 필요해요.':canRetryPhoto(job)?'사진 판독을 다시 시도할 수 있어요.':job.status==='failed'?'처리에 실패해 확인이 필요해요.':String(job.plan?.pendingQuestion||job.reply_text||job.text||'확인이 필요해요.').slice(0,140);
  return label+'\n'+detail;
 });
 return {text:pending.length?`확인할 항목 ${pending.length}건이에요.\n\n`+lines.join('\n\n')+(pending.length>8?'\n\n최근 8건을 표시했어요.':''):'지금 확인할 항목은 없어요.',buttons:{inline_keyboard:buttons}};
}
