
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('node:module');
let stage='setup',blockedWrites=0;
const nativeFetch=global.fetch;
global.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url||String(input)),method=String(init.method||input.method||'GET').toUpperCase();
 const read=method==='GET'||method==='HEAD';
 const googleAuth=url.origin==='https://oauth2.googleapis.com'&&url.pathname==='/token';
 const ai=url.origin==='https://ai-gateway.vercel.sh'&&url.pathname==='/v1/chat/completions';
 const telegramRead=url.origin==='https://api.telegram.org'&&/\/(?:getFile|getMe|getChat|getChatMember|getWebhookInfo)$/.test(url.pathname);
 if(!read&&!googleAuth&&!ai&&!telegramRead){blockedWrites++;throw Error('Verification blocked external write');}
 return nativeFetch(input,init);
};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
(async()=>{
 const agent=require(path.resolve('lib/accounting-agent.ts')),{tg}=require(path.resolve('lib/telegram.ts')),{sheetContext}=require(path.resolve('lib/accounting-context.ts'));
 stage='read-only connections';
 const hook=await tg('getWebhookInfo',{});
 assert.equal(hook.url,'https://dream-poker-reservation.vercel.app/api/accounting/webhook');
 assert.equal(process.env.ACCOUNTING_ENABLED,'true');
 console.log('PHOTO_AUDIT '+JSON.stringify({check:'webhook',connected:true,pendingUpdates:hook.pending_update_count||0}));
 const ids=[498,519,520,523,241];
 const q=await agent.db().from('dream_accounting_jobs').select('message_id,update_id,text,status,reply_id,reply_text,source_message,plan').in('message_id',ids).order('update_id',{ascending:false});
 assert(!q.error);const jobs=new Map();for(const j of q.data||[])if(!jobs.has(j.message_id))jobs.set(j.message_id,j);
 assert.equal(jobs.size,ids.length);
 const baseline=JSON.stringify(q.data);
 const [daily,fnb,master,fnbMenu]=await agent.ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500","'F&B 가격표'!A1:E100"],true);
 const rq=await agent.db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');assert(!rq.error);
 stage='load actual handler harness';
 const filename=path.resolve('tests/accounting-request-replay.cjs');
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod._compile(fs.readFileSync(filename,'utf8')+'\nmodule.exports.run=run;',filename);
 const replay=mod.exports;await replay;
 const photos=new Map(),contexts=new Map(),results=[];
 for(const id of ids){
  stage='classify saved photo '+id;
  const job=jobs.get(id),source=job.source_message,photo=source.photo?.[source.photo.length-1]||source.document;assert(photo);
  const file=await tg('getFile',{file_id:photo.file_id});assert(/^[\w/.-]+$/.test(file.file_path)&&!file.file_path.includes('..'));
  const res=await fetch('https://api.telegram.org/file/bot'+process.env.TELEGRAM_BOT_TOKEN+'/'+file.file_path,{signal:AbortSignal.timeout(15000)});
  assert(res.ok);const bytes=Buffer.from(await res.arrayBuffer());assert(bytes.length<=10000000);
  const image='data:'+(source.document?.mime_type||'image/jpeg')+';base64,'+bytes.toString('base64');photos.set(id,image);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(source.date*1000));
  const context={fnbMenu,...sheetContext(daily,master,day),businessRules:rq.data};contexts.set(id,context);
  const result=await agent.extract(job.text||'',image,context);
  if([498,519,520].includes(id)){
   assert(['other','phone_game'].includes(result.documentType));
   const simulated=await replay.run(job.text||'','photo',{history:[],rows:[],master,response:result,redeliver:true});
   assert.ifError(simulated.failure);assert.equal(simulated.job.status,'ignored');assert.equal(simulated.job.reply_text,'');assert.equal(simulated.writes,0);
   const outgoing=simulated.events.filter(e=>['sendMessage','editMessageText','setMessageReaction'].includes(e.method));
   assert.equal(outgoing.length,0);
   results.push({messageId:id,documentType:result.documentType,simulatedTelegramActions:outgoing.length,simulatedSheetWrites:simulated.writes,status:'PASS'});
  }else{
   assert.equal(result.documentType,id===241?'fnb':'paper_game');
   assert(result.operations.length>0);
   results.push({messageId:id,documentType:result.documentType,receiptOperations:result.operations.length,status:'PASS'});
  }
  console.log('PHOTO_AUDIT '+JSON.stringify(results[results.length-1]));
 }
 stage='explicit question on saved schedule';
 const caption='이 근무표 기간을 알려줘';
 const answer=await agent.extract(caption,photos.get(498),contexts.get(498));
 assert(['other','phone_game'].includes(answer.documentType));assert(answer.referenceSummary||answer.question);
 const asked=await replay.run(caption,'photo',{history:[],rows:[],master,response:answer,redeliver:true});
 assert.ifError(asked.failure);assert.equal(asked.writes,0);
 assert.equal(asked.events.filter(e=>e.method==='sendMessage').length,1);
 assert.equal(asked.events.filter(e=>e.method==='setMessageReaction').length,0);
 console.log('PHOTO_AUDIT '+JSON.stringify({check:'explicit_schedule_question',simulatedReplies:1,simulatedSheetWrites:0,status:'PASS'}));
 stage='confirm original jobs untouched';
 const after=await agent.db().from('dream_accounting_jobs').select('message_id,update_id,text,status,reply_id,reply_text,source_message,plan').in('message_id',ids).order('update_id',{ascending:false});
 assert(!after.error);assert.equal(JSON.stringify(after.data),baseline);assert.equal(blockedWrites,0);
 console.log('PHOTO_AUDIT '+JSON.stringify({status:'PASS',realPhotos:ids.length,actualTelegramMessagesSent:0,actualSheetWrites:0,actualJobWrites:0,blockedUnexpectedWrites:blockedWrites,release:false}));
})().catch(e=>{console.log('PHOTO_AUDIT '+JSON.stringify({status:'FAIL',stage,errorType:e?.name||'Error',blockedUnexpectedWrites:blockedWrites}));process.exitCode=1;});
