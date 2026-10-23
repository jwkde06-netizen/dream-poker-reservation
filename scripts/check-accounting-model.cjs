// Read-only deployment diagnostic. No ledger writes or Telegram messages.
const {getVercelOidcToken}=require('@vercel/oidc');
(async()=>{
 const model=process.env.ACCOUNTING_VISION_MODEL||process.env.ACCOUNTING_MODEL||process.env.AI_GATEWAY_MODEL;
 if(!model)throw Error('Accounting model is not configured');
 const token=process.env.AI_GATEWAY_API_KEY||await getVercelOidcToken();
 const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({model,max_tokens:128,reasoning_effort:'low',messages:[{role:'user',content:'Reply with OK only.'}]}),
  signal:AbortSignal.timeout(30000)
 });
 let body={};try{body=await r.json()}catch{}
 const error=body.error||{};
 // The request contains no user data. Still redact credentials and token-shaped strings.
 const clean=value=>String(value||'').replace(/Bearer\s+\S+|(?:sk-|vck_)[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/gi,'[redacted]').slice(0,1200);
 console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({model,status:r.status,responseModel:body.model||null,errorCode:clean(error.code||error.type),errorMessage:clean(error.message),requestId:r.headers.get('x-vercel-id')}));
})().catch(()=>{console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({error:'Probe transport or deployment authentication unavailable'}));});
