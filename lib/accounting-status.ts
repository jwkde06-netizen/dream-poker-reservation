import {gatewayStatus} from './accounting-gateway-error';
import {canRetryPhoto} from './accounting-ai-response';
import {resolvePendingJobs} from './accounting-workflow';

export function systemStatus(jobs:any[],health:{textModel:string;visionModel:string;sheetOk:boolean;historyOk:boolean;enabled:boolean}){
 const latest=new Map<number,any>();
 for(const job of jobs){const prior=latest.get(job.message_id);if(!prior||Number(job.update_id)>Number(prior.update_id))latest.set(job.message_id,job);}
 const ordered=Array.from(latest.values()).sort((a,b)=>Number(b.update_id)-Number(a.update_id));
 const observed=ordered.find(j=>j.plan?.metrics?.responseModels?.length);
 const recent=ordered.find(j=>['applied','review','failed','uncertain','writing','processing','received'].includes(j.status)&&!j.plan?.manual_handoff&&!j.plan?.resolvedBy);
 const clean=(s:string)=>s.replace(/[\r\n]/g,' ').slice(0,120);
 const lines=['Dream Buy-in Desk',`자동 정산: ${health.enabled?'켜짐':'꺼짐'}`,`설정 모델(대화): ${clean(health.textModel)}`,`설정 모델(사진): ${clean(health.visionModel)}`];
 lines.push('최근 실제 응답 모델: '+(observed?observed.plan.metrics.responseModels.map(clean).join(', '):'아직 확인 기록 없음'));
 const gatewayProblem=recent&&gatewayStatus(recent.failure_reason);if(gatewayProblem)lines.push(gatewayProblem);
 lines.push('구글 시트: '+(health.sheetOk?'읽기 연결 정상 ✅':'연결 확인 실패 ⚠️'));
 if(!health.historyOk)lines.push('최근 처리: 이력 조회 실패');
 else if(recent){
  const stamp=Date.parse(recent.created_at);
  const time=Number.isFinite(stamp)?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Ho_Chi_Minh',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(stamp):'';
  const state:Record<string,string>={applied:recent.plan?.pendingQuestion?'일부 반영 · 확인 필요':'시트 반영 완료',review:'확인 필요',failed:'처리 실패',uncertain:'시트 대조 필요',writing:'시트 기록 중',processing:'처리 중',received:'접수됨'};
  const games=Array.from(new Set((recent.plan?.operations||[]).map((o:any)=>o.game).filter((g:any)=>Number.isInteger(g)&&g>0)));
  const label=games.length?games.join(', ')+'번 게임':recent.plan?.operations?.some((o:any)=>o.kind==='fnb')?'F&B':'요청';
  lines.push(`최근 처리: ${time} ${label} ${state[recent.status]}`);
 }else lines.push('최근 12시간 처리 내역 없음');
 return lines.join('\n');
}

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
  const detail=gatewayStatus(job.failure_reason)||(['writing','uncertain'].includes(job.status)?'시트에 일부 기록됐을 수 있어 대조가 필요해요.':canRetryPhoto(job)?'사진 판독을 다시 시도할 수 있어요.':job.status==='failed'?'처리에 실패해 확인이 필요해요.':String(job.plan?.pendingQuestion||job.reply_text||job.text||'확인이 필요해요.').slice(0,140));
  return label+'\n'+detail;
 });
 return {text:pending.length?`확인할 항목 ${pending.length}건이에요.\n\n`+lines.join('\n\n')+(pending.length>8?'\n\n최근 8건을 표시했어요.':''):'지금 확인할 항목은 없어요.',buttons:{inline_keyboard:buttons}};
}
