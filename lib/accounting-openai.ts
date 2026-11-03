import {AccountingGatewayError} from './accounting-gateway-error';

// Server-only, fixed provider endpoint: never fall back to AI Gateway.
export class AccountingOpenAIError extends AccountingGatewayError {
 constructor(status:number,kind:'authentication_required'|'access_denied'|'quota_exceeded'|'request_failed'){
  super(status,kind);this.name='AccountingOpenAIError';this.message='OPENAI_API:'+kind+':'+status;
 }
}
export async function requestAccountingAI(body:Record<string,unknown>,signal?:AbortSignal){
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key)throw new AccountingOpenAIError(401,'authentication_required');
 const {max_tokens,...rest}=body;
 const response=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({...rest,...(max_tokens!==undefined?{max_completion_tokens:max_tokens}:{}),store:false}),
  signal,cache:'no-store',redirect:'error'
 });
 if(!response.ok){
  let code='';try{const error=await response.json();code=String(error?.error?.code||error?.error?.type||'');}catch{}
  const kind=response.status===401?'authentication_required':response.status===403?'access_denied':
   response.status===402||code==='insufficient_quota'?'quota_exceeded':'request_failed';
  throw new AccountingOpenAIError(response.status,kind);
 }
 return response.json();
}

