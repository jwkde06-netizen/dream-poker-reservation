const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

(async()=>{
 let identity={mode:'legacy',jobsTable:'dream_accounting_jobs',botId:'100001',chatId:'-1000000001'};
 let row={update_id:42,status:'applied',reply_text:'verified synthetic result',reply_id:null};
 let username='dream_poker_reservation_bot',identityDisabled=false;
 const queries=[],accountingCalls=[],legacyCalls=[],saved=[];
 const client={from(table){
  const query={table,filters:[]};queries.push(query);
  const chain={select(){return chain},eq(key,value){query.filters.push([key,value]);return chain},async single(){return {data:row,error:null}}};return chain;
 }};
 const modules={
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '../../../../lib/accounting-agent':{authorized:request=>request.headers.get('authorization')==='Bearer synthetic_ops',db:()=>client},
  '../../../../lib/accounting-telegram':{
   accountingIdentity:()=>{if(identityDisabled)throw Error('Dedicated accounting is not configured');return identity},
   accountingTg:async(method,payload)=>{accountingCalls.push({method,payload});return {message_id:1000}}
  },
  '../../../../lib/accounting-store':{accountingStore:()=>({save:async(id,patch)=>{saved.push({id,patch});Object.assign(row,patch)}})},
  '../../../../lib/agent-config':{agentOrigin:()=> 'https://example.invalid'},
  '../../../../lib/accounting-google':{},
  '../../../../lib/telegram':{tg:async(method,payload)=>{legacyCalls.push({method,payload});return method==='getMe'?{username}:method==='getMyName'?{name:'Dream Buy-in Desk'}:true}}
 };
 const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/api/accounting/ops/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const route={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected dependency '+name);return modules[name]},route);
 const request=(action,authorized=true)=>new Request('https://example.invalid/api/accounting/ops',{method:'POST',headers:authorized?{authorization:'Bearer synthetic_ops'}:{},body:JSON.stringify({action,messageId:77})});
 assert.equal((await route.POST(request('notifyApplied',false))).status,401);
 let response=await route.POST(request('notifyApplied'));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{sent:true,messageId:1000});
 assert.equal(queries[0].table,'dream_accounting_jobs');
 assert.deepEqual(accountingCalls[0],{method:'sendMessage',payload:{chat_id:'-1000000001',reply_parameters:{message_id:77},text:'verified synthetic result'}});
 assert.deepEqual(saved[0],{id:42,patch:{reply_id:1000}});
 await route.POST(request('notifyApplied'));
 assert.equal(accountingCalls.length,1,'persisted notifications must not be sent again');
 identity={...identity,mode:'dedicated',botId:'200002',jobsTable:'dream_accounting_jobs_v2'};row.reply_id=null;
 response=await route.POST(request('notifyApplied'));
 assert.equal(response.status,200);
 assert.equal(queries.at(-1).table,'dream_accounting_jobs_v2');
 assert.deepEqual(queries.at(-1).filters,[['message_id',77],['bot_id','200002'],['chat_id','-1000000001']]);
 row.status='review';row.reply_id=null;
 assert.equal((await route.POST(request('notifyApplied'))).status,503);
 assert.equal(accountingCalls.length,2,'only applied results may be notified');
 identityDisabled=true;
 response=await route.POST(request('renameBuyinDesk'));
 assert.equal(response.status,200);
 assert.deepEqual(legacyCalls.filter(call=>call.method==='setMyName').map(call=>call.payload),['','en','ko','vi'].map(language_code=>({name:'Dream Buy-in Desk',language_code})));
 assert.equal(accountingCalls.length,2,'renaming the original bot must never use dedicated Accounting credentials');
 username='unexpected_bot';
 assert.equal((await route.POST(request('renameBuyinDesk'))).status,503);
 assert.equal(legacyCalls.filter(call=>call.method==='setMyName').length,4);
 console.log('Accounting upstream ops: applied notifications, role scoping, replay and fixed legacy bot name checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
