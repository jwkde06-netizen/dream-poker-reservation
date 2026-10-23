// Explicit operator utility; never runs in the normal build or cron.
(async()=>{
 const [action,rawId]=process.argv.slice(2),messageId=Number(rawId);
 if(!['dryrunphoto','recoverGatewayPhoto'].includes(action)||!Number.isSafeInteger(messageId)||messageId<1)throw Error('Invalid operation');
 if(!process.env.ACCOUNTING_OPS_SECRET)throw Error('Operations credential unavailable');
 const r=await fetch('https://dream-poker-reservation.vercel.app/api/accounting/ops',{method:'POST',headers:{Authorization:'Bearer '+process.env.ACCOUNTING_OPS_SECRET,'Content-Type':'application/json'},body:JSON.stringify({action,messageId}),signal:AbortSignal.timeout(180000)});
 const result=await r.json();
 // Deliberately omit raw image, source message and credentials.
 const summary=action==='dryrunphoto'?{model:result.model,question:result.question,operations:result.operations,plannedChanges:result.plannedChanges,error:result.error}:{status:result.status,reply_id:result.reply_id,reply_text:result.reply_text,failure_reason:result.failure_reason,error:result.error};
 console.log('ACCOUNTING_OPS_RESULT '+JSON.stringify({action,messageId,httpStatus:r.status,...summary}));
 if(!r.ok)process.exitCode=1;
})().catch(()=>{console.error('ACCOUNTING_OPS_RESULT transport or configuration failure');process.exitCode=1});
