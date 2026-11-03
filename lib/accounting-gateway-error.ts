// Keep provider responses out of staff messages and persisted diagnostics.
export type GatewayFailureKind='paid_credits_required'|'authentication_required'|'access_denied'|'quota_exceeded'|'not_configured'|'request_failed';
// Legacy Vercel AI Gateway failures keep the AI_GATEWAY prefix; direct OpenAI failures use AI_PROVIDER.
export class AccountingGatewayError extends Error {
 constructor(public status:number,public kind:GatewayFailureKind,prefix:'AI_GATEWAY'|'AI_PROVIDER'='AI_GATEWAY'){
  super(prefix+':'+kind+':'+status);this.name='AccountingGatewayError';
 }
}
// Direct OpenAI API. Only status and the machine-readable error code are inspected; messages never leave this function.
export function classifyOpenAIFailure(status:number,body:any):GatewayFailureKind {
 const code=String(body?.error?.code||'');
 const type=String(body?.error?.type||'');
 if(status===429&&(code==='insufficient_quota'||type==='insufficient_quota'))return 'quota_exceeded';
 if(status===401)return 'authentication_required';
 if(status===403||status===404||code==='model_not_found')return 'access_denied';
 return 'request_failed';
}
export async function openaiError(response:Response){
 let body:any=null;try{body=await response.json()}catch{}
 return new AccountingGatewayError(response.status,classifyOpenAIFailure(response.status,body),'AI_PROVIDER');
}
export function openaiNotConfigured(){return new AccountingGatewayError(0,'not_configured','AI_PROVIDER');}
// Credit, key and access problems cannot be fixed by retrying the same request.
export function isFatalProviderError(e:unknown){return e instanceof AccountingGatewayError&&e.kind!=='request_failed';}
export function classifyGatewayFailure(status:number,body:any):GatewayFailureKind {
 const code=String(body?.error?.code||body?.error?.type||'');
 const message=String(body?.error?.message||'');
 if(status===403&&code==='no_providers_available'&&/free tier.*(?:do not have access|not available)|upgrade to paid credits/i.test(message))return 'paid_credits_required';
 if(status===401||status===403&&code==='customer_verification_required')return 'authentication_required';
 if(status===403)return 'access_denied';
 if(status===402)return 'quota_exceeded';
 return 'request_failed';
}
export async function gatewayError(response:Response){
 let body:any=null;try{body=await response.json()}catch{}
 return new AccountingGatewayError(response.status,classifyGatewayFailure(response.status,body));
}
export function gatewayStaffMessage(error:AccountingGatewayError){
 if(error.kind==='quota_exceeded'&&error.message.startsWith('AI_PROVIDER:'))return '사진은 저장했어요. AI 사용 크레딧이나 한도가 부족해 시트에 기록하지 못했어요. 다시 올리실 필요는 없어요.';
 if(error.kind==='paid_credits_required')return '사진은 저장했어요. 현재 AI 모델에 필요한 유료 크레딧이 없어 시트에 기록하지 못했어요. 다시 올리실 필요는 없어요.';
 return 'AI 연결 문제로 시트에 기록하지 못했어요. 접수한 자료는 저장돼 있어 다시 올리실 필요는 없어요.';
}
export function gatewayStatus(reason:unknown){
 const text=String(reason||'');
 if(text.startsWith('AI_PROVIDER:quota_exceeded:'))return 'AI 연결: OpenAI 크레딧·한도 확인 필요 ⚠️';
 if(/^AI_PROVIDER:(?:authentication_required|not_configured):/.test(text))return 'AI 연결: OpenAI 키 확인 필요 ⚠️';
 if(text.startsWith('AI_PROVIDER:'))return 'AI 연결: 호출 실패 · 관리자 확인 필요 ⚠️';
 if(text.startsWith('AI_GATEWAY:paid_credits_required:'))return 'AI 연결: 유료 크레딧 충전 필요 ⚠️';
 if(text.startsWith('AI_GATEWAY:')||/^AI Gateway request failed (401|402|403)/.test(text))return 'AI 연결: 호출 실패 · 관리자 확인 필요 ⚠️';
 return null;
}
