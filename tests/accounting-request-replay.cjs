const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const strip=require('node:module').stripTypeScriptTypes||((source)=>require('typescript').transpileModule(source,{compilerOptions:{target:99}}).outputText);
function compile(source){
 const js=strip(source,{mode:'transform'});
 const names=[...js.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
 return js.replace(/export\s*\{\s*(\w+)\s+as\s+(\w+)\s*\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,a,f)=>"exports."+a+"=require('"+f+"')."+n+";").replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,f)=>"const {"+n+"}=require('"+f+"');").replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/g,'')+'\nObject.assign(exports,{'+names.join(',')+'});';
}
const date='2026-10-23',stamp=Date.parse(date+'T19:50:00+07:00')/1000;
const op={kind:'total',date,game:9,table:14,blind:'5M',player:'PARK SOO MIN',buyins:2,chips:200000};
const paper={date,printedGame:7,table:2,names:['PARK SOO MIN'],chipAmounts:[200000],selected:[true],hasSelectionMarkers:false};
const question='사진의 Table 2 명단은 기존 9번 게임(14-1)의 리바인 명단이 맞나요?';
const originalOp=op,originalPaper=paper,originalStamp=stamp;
async function run(text,mode='status',fixture=null){
 const op=fixture?.op||originalOp,paper=fixture?.paper||originalPaper,stamp=fixture?.stamp||originalStamp;
 const jobs=[
 {update_id:349,message_id:349,sender_id:'1',status:'review',plan:{pendingQuestion:'몇 번 게임인가요?'},created_at:date+'T12:37:00Z',source_message:{date:stamp-780,photo:[{file_id:'fixture',file_unique_id:'fixture'}]}},
 {update_id:357,message_id:357,sender_id:'1',status:'review',plan:{contextMessageId:349,photoSourceMessageId:349,pendingQuestion:question},created_at:date+'T12:47:00Z',source_message:{date:stamp-180,photo:[{file_id:'fixture',file_unique_id:'fixture'}]}}
 ];
 if(fixture)jobs.splice(0,jobs.length,...fixture.history);
 if(mode==='status')jobs.push({update_id:360,message_id:360,status:'applied',plan:{contextMessageId:357,operations:[op]},created_at:date+'T12:48:00Z'});
 const master=fixture?.master||[['NAME','CARD','CODE'],['PARK SOO MIN','','KOREA']];
 const formula=Array(15).fill('');for(const i of [5,6,8,9,10,11,12,13,14])formula[i]='=ARRAYFORMULA(test)';
 const daily=fixture?[['GAME'],formula,...fixture.rows]:[['GAME'],formula,[9,46318,'14-1','5M','PARK SOO MIN','','KOREA',2]];
 const events=[];let writes=0,ai=0;const rules=[];
 function query(table){
  let filters=[],patch=null,sort=null,limit=Infinity,one=false;
  const q={
   select(){return q;},upsert(value){if(table==='dream_accounting_rules'){rules.push({...value,id:1,active:true});}else if(!jobs.some(j=>j.update_id===value.update_id))jobs.push({...value,created_at:date+'T12:50:00Z'});return q;},
   update(value){patch=value;return q;},
   eq(k,v){filters.push(r=>r[k]===v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
   gte(){return q;},order(k,o){sort=[k,o];return q;},limit(n){limit=n;return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},
   then(resolve,reject){try{let rows=(table==='dream_accounting_rules'?rules:jobs).filter(r=>filters.every(f=>f(r)));if(mode==='readback-fail'&&table==='dream_accounting_rules'&&one&&filters.length)rows=[];if(sort)rows.sort((a,b)=>(a[sort[0]]>b[sort[0]]?1:-1)*(sort[1].ascending?1:-1));rows=rows.slice(0,limit);if(patch)rows.forEach(r=>Object.assign(r,patch));return Promise.resolve({data:one?rows[0]:rows,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}
  };return q;
 }
 const tg=async(method,data)=>{events.push({method,...data});if(method==='getFile')return {file_path:'fixture.jpg'};if(method==='getChatMember')return {status:mode==='unauthorized'?'left':'member'};return {message_id:900};};
 const fetch=async(url,init={})=>{
  if(url.startsWith('https://sheets.googleapis.com')){
   assert(!init.body,'no Sheets mutation permitted');const u=new URL(url);
   const values=u.searchParams.getAll('ranges').map(r=>r.includes('플레이어')?master:r.includes('일일 입력')?(r.endsWith('O2')?daily.slice(0,2):daily):[]);
   return {ok:true,json:async()=>({valueRanges:values.map(values=>({values}))})};
  }
  if(url.startsWith('https://api.telegram.org/file/'))return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};
  if(url.includes('ai-gateway')){
   ai++;const body=JSON.parse(init.body);const columns=body.max_tokens===2500||body.max_tokens===4000;
   const teaching=['rules','readback-fail','unauthorized'].includes(mode);
   const result=teaching?{documentType:'other',operations:[],question:null,memory:{action:'save',kind:'instruction',content:'사진 접수 시 진행 안내를 한 번 보낸다.'}}:columns?{documents:[paper]}:{documentType:'paper_game',operations:fixture?.operations||[op],question:fixture?null:'9번 게임의 용지 번호를 확인해주세요.',memory:null};
   return {ok:true,json:async()=>({model:'fixture',usage:{total_tokens:1},choices:[{finish_reason:'stop',message:{content:JSON.stringify(result)}}]})};
  }
  throw Error('Unexpected external request '+url);
 };
 const cache={};
 function load(name){
  if(name==='node:crypto'||name==='crypto')return require('node:crypto');
  if(name==='@supabase/supabase-js')return {createClient:()=>({from:query,rpc:async()=>({data:true})})};
  if(name==='@vercel/oidc')return {getVercelOidcToken:async()=>'fixture'};
  if(name==='./telegram')return {tg,projectUrl:'fixture'};
  if(name==='./accounting-google')return {accessToken:async()=>'fixture',accountingWorkbook:'fixture'};
  if(cache[name])return cache[name];
  const exports={};cache[name]=exports;
  new Function('require','exports','process','Buffer','fetch',compile(fs.readFileSync(path.join(__dirname,'../lib',name.replace('./','')+'.ts'),'utf8')))(load,exports,{env:{STAFF_TELEGRAM_CHAT_ID:'-1',AI_GATEWAY_API_KEY:'fixture'}},Buffer,fetch);
  return exports;
 }
 let failure;try{await load('./accounting-agent').handle({update_id:400,message:{message_id:400,date:stamp,chat:{id:-1,type:'supergroup'},from:{id:1},text,...(fixture?{photo:[{file_id:'new-fixture',file_unique_id:'new-fixture'}]}:{})}});}catch(e){failure=e;}
 return {failure,rules,job:jobs.find(j=>j.message_id===400),events,ai,load};
}
module.exports=(async()=>{
 const status=await run('@dream_poker_reservation_bot 시트에 다 입력된거야?');
 assert.ifError(status.failure);
 assert.equal(status.job.reply_text,'✅ 반영 확인 1건');assert.equal(status.ai,0);
 assert.equal(status.events.filter(e=>e.method==='sendMessage').length,1);
 assert(!/모델|15건/.test(status.job.reply_text));
 const {sheetStatusQuestion}=status.load('./accounting-conversation');
 for(const text of ['사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.\n규칙저장','처리 결과 안내\n사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.'])assert.equal(sheetStatusQuestion(text),false);
 const rebuy=await run('네','rebuy');
 assert.ifError(rebuy.failure);
 assert.equal(rebuy.job.status,'applied',rebuy.job.reply_text);
 assert.equal(rebuy.job.plan.confirmedRebuy.game,9);
 assert.equal(rebuy.job.plan.confirmedRebuy.table,14);
 assert.equal(rebuy.job.plan.confirmedRebuy.paperTable,2);
 assert.equal(rebuy.job.plan.pendingQuestion,null);
 assert.equal(rebuy.job.reply_text,'✅ 구글 시트에 이미 반영되어 있어요.');
 const {confirmedRebuyContext}=rebuy.load('./accounting-vision');
 assert.equal(confirmedRebuyContext('2바인',rebuy.job,[{date,gameNumber:9,tableLabel:'14-1',tableNumber:14}]).game,9);
 assert.equal(confirmedRebuyContext('아니 2번 게임',rebuy.job,[{date,gameNumber:9,tableLabel:'14-1',tableNumber:14}]),null);
 const {requestSheetStatus}=status.load('./accounting-request-status');
 const games=[{date,gameNumber:9,tableNumber:14,blind:'5M',players:[{name:op.player,buyins:1}]}];
 assert.match(requestSheetStatus([{message_id:1,status:'applied',plan:{operations:[op]}}],games,[],[]),/대조·확인 필요 1건/);
 assert.match(requestSheetStatus([{message_id:1,status:'failed',plan:{operations:[op]}}],games,[],[]),/처리 실패 1건/);
 assert(!requestSheetStatus([{message_id:1,status:'applied',plan:{pendingQuestion:'이름 확인',operations:[op]}}],games,[],[]).startsWith('✅'));
 for(const instruction of ['처리 결과 안내\n사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.','사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.\n규칙저장']){
  const taught=await run(instruction,'rules');assert.ifError(taught.failure);assert.equal(taught.rules.length,1);assert.match(taught.job.reply_text,/사진 접수 시 진행 안내/);assert(!taught.job.reply_text.includes('반영 확인'));
 }
 const rejected=await run('앞으로 사진 접수 시 안내 규칙저장','unauthorized');assert.equal(rejected.rules.length,0);assert.equal(rejected.job.status,'review');
 const mismatch=await run('앞으로 사진 접수 시 안내 규칙저장','readback-fail');assert.ifError(mismatch.failure);assert.equal(mismatch.job.status,'review');assert.match(mismatch.job.reply_text,/저장 결과를 확인하지 못/);assert(!mismatch.job.reply_text.includes('저장했'));
 assert(sheetStatusQuestion('다 입력됐어?'));

 // 2026-10-24 00:41/00:42 uploads of October 23 papers. Ledger was
 // manually renumbered and completed; the actual handler must make zero writes.
 for(const fixture of [
  {printedGame:19,table:4,game:18,label:'4-5',
   names:[null,'LEE SUNG WON','CORDINGLEY OLIVER JAMES','CHANG YOON HO','KIM SOO MIN','NGUYEN THAN MINH','KAPUSTIN IVAN','KIM SEON HAK','DINH TIEN VU'],
   amounts:[null,100000,400000,200000,200000,200000,100000,200000,100000],
   players:[['CORDINGLEY OLIVER JAMES',4],['KIM SOO MIN',2],['KIM SEON HAK',2],['CHANG YOON HO',2],['KANG JIN HO',1],['LEE SUNG WON',1]],
   prior:['CORDINGLEY OLIVER JAMES','KIM SOO MIN','KIM SEON HAK']},
  {printedGame:20,table:5,game:19,label:'5-5',
   names:['KIM HYUNG WOOK','TRAN TRONG QUY','LEE HAE WON','TRAN DINH LOC','KIM DEOK WOO','JANG EUNSANG','PHAN VAN THANH DAT','TRAN MINH TUAN','PHAN XUAN THANH'],
   amounts:[100000,100000,200000,100000,100000,100000,300000,500000,100000],
   players:[['KIM HYUNG WOOK',1],['LEE HAE WON',2],['KIM DEOK WOO',1],['LEE SEOK HO',1]],
   prior:['KIM HYUNG WOOK','LEE HAE WON','KIM DEOK WOO','LEE SEOK HO']}
 ]){
  const base={date,game:fixture.printedGame,table:fixture.table,printedGame:fixture.printedGame,blind:'5M'};
  const paper={date,table:fixture.table,printedGame:fixture.printedGame,names:fixture.names,chipAmounts:fixture.amounts,selected:fixture.names.map(Boolean),crossedOut:fixture.names.map(()=>false),hasSelectionMarkers:false};
  const operations=fixture.players.filter(([name])=>fixture.names.includes(name)).map(([player,buyins],i)=>({...base,kind:i%2?'add':'total',player,buyins,chips:buyins*100000}));
  const priorOps=fixture.prior.map(player=>({...base,kind:'add',player,buyins:1}));
  const history=[{update_id:380,message_id:380,status:'applied',created_at:date+'T16:00:00Z',source_message:{date:originalStamp},plan:{
   operations:priorOps,chipVerification:{documents:[{...paper,names:fixture.prior,chipAmounts:fixture.prior.map(()=>100000)}]},
   sheetState:{version:1,date,overrides:[],aliases:[],entries:fixture.prior.map(player=>({date,game:fixture.printedGame,tableLabel:fixture.label,blind:'5M',player,buyins:1}))}
  }}];
  const master=[['NAME','CARD','CODE'],...fixture.players.map(([name])=>[name,'','KOREA'])];
  const rows=fixture.players.map(([name,count],i)=>[i?'':fixture.game,46318,fixture.label,'5M',name,'','KOREA',count]);
  const runFixture={op:operations[0],paper,operations,history,master,rows,stamp:Date.parse('2026-10-24T00:42:00+07:00')/1000};
  const result=await run('','photo',runFixture);
  assert.ifError(result.failure);assert.equal(result.job.status,'applied',result.job.reply_text);
  assert.equal(result.job.plan.pendingQuestion,null);
  assert.equal(result.job.plan.changes.length,0,'manual rows must be preserved');
  assert(result.job.plan.operations.every(o=>o.game===fixture.game));
  assert(result.job.plan.operations.every(o=>o.rebuyBinding?.tableLabel===fixture.label));
  assert.equal(result.events.filter(e=>e.method==='sendMessage').length,1,'one photo receipt, edited to final');
  const {bindRebuyHistory,completePhotoRoster,verifyChipEvidence}=result.load('./accounting-vision');
  const {sheetContext}=result.load('./accounting-context');
  const games=sheetContext([[],...rows],master,date).games;
  assert(completePhotoRoster(operations,{documents:[paper]},master).operations.length>0,'mixed add/total is one roster');
  const bound=bindRebuyHistory(operations,{documents:[paper]},games,history);
  assert(bound.every(o=>o.game===fixture.game));
  assert(!bindRebuyHistory(operations,{documents:[paper]},games,[]).some(o=>o.rebuyBinding),'no overlap-only mapping');
  assert(!bindRebuyHistory(operations,{documents:[{...paper,printedGame:99}]},games,history).some(o=>o.rebuyBinding),'new No. must not reuse old game');
  const ambiguous=[...history,{...history[0],message_id:379,plan:{...history[0].plan,sheetState:{...history[0].plan.sheetState,entries:history[0].plan.sheetState.entries.map(e=>({...e,tableLabel:fixture.table+'-6'}))}}}];
  assert(!bindRebuyHistory(operations,{documents:[paper]},[...games,{...games[0],gameNumber:25,tableLabel:fixture.table+'-6'}],ambiguous).some(o=>o.rebuyBinding),'multiple historical sessions require review');
  const bad={...paper,chipAmounts:paper.chipAmounts.map(n=>n? n+100000:null)};
  assert.equal(verifyChipEvidence(bound,{documents:[bad]}).operations.length,0,'binding must not bypass chip mismatch');
 }
 console.log('Midnight rebuy fixtures passed: No19/table4 -> game18/4-5; No20/table5 -> game19/5-5; mixed operation kinds; preserved absent/manual players; zero Sheet writes; ambiguous sessions and new numbers not inferred.');

 console.log('Actual handler replay passed: tagged status, chain deduplication, no AI/no sheet writes for status, rebuy confirmation before guards, persisted binding, rule/status separation.');
})();
