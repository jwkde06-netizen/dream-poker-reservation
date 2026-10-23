export function canRecoverGatewayPhoto(job:any){
 return !!job&&job.status==='failed'&&/^(AI Gateway request failed (401|402|403)$|AI_GATEWAY:(paid_credits_required|authentication_required|access_denied|quota_exceeded):(401|402|403)$)/.test(job.failure_reason||'')
 &&!job.plan?.changes?.length&&!job.plan?.operations?.length&&!job.plan?.manual_handoff&&!job.plan?.resolvedBy
 &&Number.isSafeInteger(job.update_id)&&Number.isSafeInteger(job.message_id)&&/^\d+$/.test(job.sender_id||'')
 &&Number.isSafeInteger(job.source_message?.date)&&!!(job.source_message?.photo?.length||job.source_message?.document);
}
