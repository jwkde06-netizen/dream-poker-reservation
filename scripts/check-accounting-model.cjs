// Explicit read-only probe. No ledger or Telegram writes.
(async()=>{
 const key=process.env.OPENAI_API_KEY?.trim();
 if(!key){console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({provider:'openai',error:'OPENAI_API_KEY is not configured'}));return;}
 const configured=process.env.ACCOUNTING_VISION_MODEL||process.env.ACCOUNTING_MODEL||process.env.AI_GATEWAY_MODEL||'gpt-6-astra';
 const model=configured.startsWith('openai/')?configured.slice(7):configured;
 if(model.includes('/'))throw Error('Unsupported model');
 const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model,max_completion_tokens:128,reasoning_effort:'low',store:false,messages:[{role:'user',content:'Reply with OK only.'}]}),signal:AbortSignal.timeout(30000),redirect:'error'});
 let body={};try{body=await r.json()}catch{}
 console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({provider:'openai',model,status:r.status,responseModel:body.model||null,errorCode:String(body.error?.code||body.error?.type||'').replace(/[^a-z0-9_-]/gi,'').slice(0,80)}));
})().catch(()=>console.log('ACCOUNTING_MODEL_PROBE '+JSON.stringify({provider:'openai',error:'Probe transport unavailable'})));

