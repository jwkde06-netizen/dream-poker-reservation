// Read-only diagnostic for the direct OpenAI connection. Sends one tiny text request: no ledger writes, no Telegram messages, no user data.
// Run with the key already in the environment (for example `OPENAI_API_KEY=... node scripts/check-accounting-model.cjs`); the key is never printed.
(async()=>{
 const raw=(process.env.ACCOUNTING_VISION_MODEL||process.env.ACCOUNTING_MODEL||'gpt-6.1-sol').trim().replace(/^openai\//,'');
 const key=(process.env.OPENAI_API_KEY||'').trim();
 if(!key){console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({model:raw,error:'OPENAI_API_KEY is not set'}));return;}
 const r=await fetch('https://api.openai.com/v1/chat/completions',{
  method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify({model:raw,max_completion_tokens:256,reasoning_effort:'low',messages:[{role:'user',content:'Reply with OK only.'}]}),
  signal:AbortSignal.timeout(30000)
 });
 let body={};try{body=await r.json()}catch{}
 const error=body.error||{};
 const clean=value=>String(value||'').replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/gi,'[redacted]').slice(0,1200);
 console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({model:raw,status:r.status,responseModel:body.model||null,errorCode:clean(error.code||error.type),errorMessage:clean(error.message),requestId:r.headers.get('x-request-id')}));
})().catch(()=>{console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({error:'Probe transport unavailable'}));});
