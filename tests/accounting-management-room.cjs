const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function load(name,imports={}){
 const source=fs.readFileSync(path.join(__dirname,'../lib',name+'.ts'),'utf8');
 const stripped=stripTypeScriptTypes(source,{mode:'transform'});
 const names=[...stripped.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
 const code=stripped.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,f)=>'const {'+n+'}=require('+JSON.stringify(f)+');').replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/g,'')+'\nObject.assign(exports,{'+names.join(',')+'});';
 const exports={};vm.runInNewContext(code,{exports,process,Date,Buffer,require:n=>n in imports?imports[n]:require(n)},{filename:name});return exports;
}
const domain=load('accounting-management-domain'),memory=load('accounting-memory');
const staff='-100',room='-200';
const message=(id,text='관리실 연결',extra={})=>({update_id:id,message:{message_id:id,chat:{id:room,type:'group',title:'Dream Bot 관리실'},from:{id:77},text,...extra}});
assert.equal(domain.managementCommand('/rules@dream_poker_reservation_bot').action,'list');
assert.equal(domain.managementCommand('규칙 삭제 12').id,12);
assert.equal(domain.managementMessage(message(1),room,''),null);
assert.equal(domain.managementMessage({...message(1),edited_message:message(1).message,message:undefined},staff,''),null);
assert.equal(domain.managementMessage(message(1,'',{from:{id:77,is_bot:true}}),staff,''),null);
let state,events,memberStatus,localStatus,result,extractCalls,readbackFail,sendFail,releaseCalls;
function reset(){
 state={dream_accounting_management_room:[],dream_accounting_management_jobs:[],dream_accounting_rules:[]};
 events=[];memberStatus='administrator';localStatus='creator';result={memory:null,operations:[]};extractCalls=0;readbackFail=false;sendFail=false;releaseCalls=0;
}
function database(){return {rpc:async name=>{if(name==='dream_accounting_release')releaseCalls++;return {data:true,error:null};},from(name){
 assert(name in state,'Management handler must never access ledger or other tables: '+name);
 const q={op:'select',filter:[],value:null,one:false,select(){return this;},eq(k,v){this.filter.push([k,v]);return this;},order(){return this;},
 insert(v){this.op='insert';this.value=v;return this;},upsert(v){this.op='upsert';this.value=v;return this;},update(v){this.op='update';this.value=v;return this;},
 maybeSingle(){this.one=true;return this;},single(){this.one=true;return this;},
 then(resolve,reject){try{
  events.push(name+':'+this.op);
  let rows=state[name].filter(r=>this.filter.every(([k,v])=>r[k]===v));
  if(this.op==='insert'||this.op==='upsert'){
   let found=this.op==='upsert'?state[name].find(r=>r.source_update===this.value.source_update):null;
   if(found){Object.assign(found,this.value);rows=[found];}
   else{const row={active:true,id:state[name].length+1,...this.value};state[name].push(row);rows=[row];}
  }
  if(this.op==='update')rows.forEach(r=>Object.assign(r,this.value));
  const failed=readbackFail&&name==='dream_accounting_rules'&&this.op==='select'&&this.filter.some(([k])=>k==='id');
  resolve({data:failed?null:this.one?rows[0]||null:rows.map(r=>({...r})),error:failed?{message:'injected readback error'}:null});
 }catch(e){reject(e);}}
 };return q;
 }};}
async function tg(method,p){
 if(method==='getChatMember')return {status:String(p.chat_id)===staff?memberStatus:localStatus};
 assert.equal(method,'sendMessage');events.push('telegram:send');
 if(sendFail)throw Error('delivery uncertain');
 return {message_id:900};
}
const handler=load('accounting-management-room',{'./accounting-agent':{db:database,extract:async()=>{extractCalls++;return result;}},'./telegram':{tg},'./accounting-memory':memory,'./accounting-management-domain':domain});
module.exports=(async()=>{
 const before=process.env.STAFF_TELEGRAM_CHAT_ID,report=process.env.ACCOUNTING_REPORT_CHAT_ID;
 process.env.STAFF_TELEGRAM_CHAT_ID=staff;process.env.ACCOUNTING_REPORT_CHAT_ID='-300';
 try{
  reset();assert.equal(await handler.handleManagementRoom(message(1)),true);
  assert.equal(state.dream_accounting_management_room[0].chat_id,room);
  assert.match(state.dream_accounting_management_jobs[0].response,/연결 완료/);
  const sent=events.filter(x=>x==='telegram:send').length;await handler.handleManagementRoom(message(1));assert.equal(events.filter(x=>x==='telegram:send').length,sent);
  result={memory:{action:'save',kind:'instruction',content:'5M은 게임 종류이며 54번 게임으로 해석하지 않는다.'},operations:[{kind:'add',game:99}]};
  await handler.handleManagementRoom(message(2,'앞으로 5M을 게임 번호로 읽지 마. 규칙 저장해'));
  assert.equal(state.dream_accounting_rules.length,1);assert.equal(state.dream_accounting_management_jobs.at(-1).status,'sent');
  assert.match(state.dream_accounting_management_jobs.at(-1).response,/공통 적용/);
  await handler.handleManagementRoom(message(3,'같은 규칙 저장해'));assert.equal(state.dream_accounting_rules.length,1);
  const calls=extractCalls;await handler.handleManagementRoom(message(4,'',{photo:[{file_id:'test'}]}));assert.equal(extractCalls,calls);assert.match(state.dream_accounting_management_jobs.at(-1).response,/입력하지 않았/);
  await handler.handleManagementRoom(message(5,'규칙 목록'));assert.match(state.dream_accounting_management_jobs.at(-1).response,/5M/);
  await handler.handleManagementRoom(message(6,'규칙 삭제 1'));assert.equal(state.dream_accounting_rules[0].active,false);
  memberStatus='member';await handler.handleManagementRoom(message(7,'규칙 저장해'));assert.equal(state.dream_accounting_management_jobs.length,6);
  memberStatus='administrator';localStatus='member';await handler.handleManagementRoom(message(8,'규칙 저장해'));assert.equal(state.dream_accounting_management_jobs.length,6);
  localStatus='creator';const other=message(9);other.message.chat.id='-400';await handler.handleManagementRoom(other);assert.equal(state.dream_accounting_management_room[0].chat_id,room);
  reset();memberStatus='member';await handler.handleManagementRoom(message(10));assert.equal(state.dream_accounting_management_room.length,0);
  reset();await handler.handleManagementRoom(message(11));result={memory:{action:'save',kind:'instruction',content:'기본 층은 2F'},operations:[]};readbackFail=true;
  await assert.rejects(handler.handleManagementRoom(message(12,'앞으로 기본 층은 2F')));assert.equal(events.filter(x=>x==='telegram:send').length,1);assert(releaseCalls>=2);
  readbackFail=false;await handler.handleManagementRoom(message(12,'앞으로 기본 층은 2F'));assert.equal(state.dream_accounting_rules.length,1);
  sendFail=true;await handler.handleManagementRoom(message(13,'규칙 목록'));assert.equal(state.dream_accounting_management_jobs.at(-1).status,'uncertain');
  const attempts=events.filter(x=>x==='telegram:send').length;await handler.handleManagementRoom(message(13,'규칙 목록'));assert.equal(events.filter(x=>x==='telegram:send').length,attempts);
  const webhook=fs.readFileSync(path.join(__dirname,'../app/api/accounting/webhook/route.ts'),'utf8');assert(webhook.indexOf('await handleManagementRoom(update)')<webhook.indexOf('await handle(update)'));
  console.log('PASS management room: pairing, admin checks, shared rules, photo/ledger isolation, duplicates, readback and delivery recovery');
 }finally{
  if(before===undefined)delete process.env.STAFF_TELEGRAM_CHAT_ID;else process.env.STAFF_TELEGRAM_CHAT_ID=before;
  if(report===undefined)delete process.env.ACCOUNTING_REPORT_CHAT_ID;else process.env.ACCOUNTING_REPORT_CHAT_ID=report;
 }
})();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1;});
