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
 if(fixture)jobs.splice(0,jobs.length,...JSON.parse(JSON.stringify(fixture.history)));
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
 const tg=async(method,data)=>{events.push({method,...data,aiCallsAtSend:ai});if(method==='getFile')return {file_path:'fixture.jpg'};if(method==='getChatMember')return {status:mode==='unauthorized'?'left':'member'};return {message_id:900};};
 const fetch=async(url,init={})=>{
  if(url.startsWith('https://sheets.googleapis.com')){
   const u=new URL(url);
   if(fixture?.allowWrites){
    const coords=r=>{const m=r.match(/!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);assert(m,r);const col=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;return [Number(m[2])-1,col(m[1]),Number(m[4]||m[2])-1,col(m[3]||m[1])];};
    if(u.searchParams.has('fields'))return {ok:true,json:async()=>({sheets:[{properties:{title:'일일 입력',sheetId:1}}]})};
    if(init.body){const body=JSON.parse(init.body);if(body.data){writes++;for(const c of body.data){assert(c.range.startsWith("'일일 입력'!"));const [r,col]=coords(c.range);c.values.forEach((row,i)=>row.forEach((v,j)=>{assert(![5,6,8,9,10,11,12,13,14].includes(col+j),'formula column preserved');daily[r+i]??=[];daily[r+i][col+j]=v;}));}}else assert(body.requests.every(r=>r.repeatCell?.fields==='userEnteredFormat.numberFormat'));
     return {ok:true,json:async()=>({})};
    }
    const values=u.searchParams.getAll('ranges').map(r=>{if(!r.includes('일일 입력'))return r.includes('플레이어')?master:[];const [r1,c1,r2,c2]=coords(r);return daily.slice(r1,r2+1).map(row=>Array.from({length:c2-c1+1},(_,i)=>{const v=row[c1+i]??'';return u.searchParams.get('valueRenderOption')==='FORMATTED_VALUE'&&c1+i===1&&typeof v==='number'?new Date((v-25569)*86400000).toISOString().slice(0,10):v;}));});
    return {ok:true,json:async()=>({valueRanges:values.map(values=>({values}))})};
   }
   assert(!init.body,'no Sheets mutation permitted');
   const values=u.searchParams.getAll('ranges').map(r=>r.includes('플레이어')?master:r.includes('일일 입력')?(r.endsWith('O2')?daily.slice(0,2):daily):[]);
   return {ok:true,json:async()=>({valueRanges:values.map(values=>({values}))})};
  }
  if(url.startsWith('https://api.telegram.org/file/'))return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};
  if(url.includes('ai-gateway')){
   ai++;const body=JSON.parse(init.body);const columns=body.max_tokens===2500||body.max_tokens===4000;
   if(fixture?.classificationFailure)throw Error('Fixture classification unavailable');
   if(columns&&fixture?.verificationFailure)throw Error('Fixture receipt verification unavailable');
   const teaching=['rules','readback-fail','unauthorized'].includes(mode);
   const result=teaching?{documentType:'other',operations:[],question:null,memory:{action:'save',kind:'instruction',content:'사진 접수 시 진행 안내를 한 번 보낸다.'}}:columns?{documents:[paper]}:fixture?.response||{documentType:'paper_game',operations:fixture?.operations||[op],question:fixture?null:'9번 게임의 용지 번호를 확인해주세요.',memory:null};
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
 let failure;try{const update={update_id:400,[fixture?.edited?'edited_message':'message']:{message_id:400,date:stamp,chat:{id:-1,type:'supergroup'},from:{id:1,is_bot:!!fixture?.fromBot},text,...(fixture?.replyTo?{reply_to_message:{message_id:fixture.replyTo}}:fixture?.document?{document:{file_id:'new-fixture',file_unique_id:'new-fixture',mime_type:'image/png'}}:fixture?{photo:[{file_id:'new-fixture',file_unique_id:'new-fixture'}]}:{})}};await load('./accounting-agent').handle(update);if(fixture?.redeliver)await load('./accounting-agent').handle(update);}catch(e){failure=e;}
 return {failure,rules,writes,daily,jobs,job:jobs.find(j=>j.message_id===400),events,ai,load};
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
 assert.equal(rebuy.job.reply_text,'✅ 9번 게임 리바인 이미 반영됨');
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
  assert.ifError(result.failure);assert.equal(result.job.status,'review',result.job.reply_text);
  const missingName=fixture.printedGame===19?'KANG JIN HO':'LEE SEOK HO';
  assert.match(result.job.plan.pendingQuestion,/버스트아웃했을 가능성/);
  assert(result.job.plan.pendingQuestion.includes(missingName));
  assert.equal(result.job.plan.unverifiedOperations.length,1);
  const missing=result.job.plan.unverifiedOperations[0];
  assert.equal(missing.player,missingName);assert.equal(missing.kind,'total');assert.equal(missing.chips,null);
  const resumed=result.load('./accounting-vision').continueChipConfirmation('2바인',result.job);
  assert.equal(resumed.operations[0].player,missingName);assert.equal(resumed.operations[0].buyins,2);
  assert.equal(result.events.filter(e=>e.method==='sendMessage'&&e.chat_id!=='-1').length,0);
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


 // Oct 24: paper No.7 was applied as ledger game7; reply to receipt411
 // says "이건 6번게임이지". Model may also mislabel cancellation as game6.
 for(const cancelGame of [7,6]){
  const day='2026-10-24',time=Date.parse(day+'T17:34:05+07:00')/1000;
  const names=['LEE HAE WON','BAEK JAE HUI','LEE SUNG WON'];
  const source=names.map(player=>({kind:'add',date:day,game:7,printedGame:7,table:15,blind:'5M',player,buyins:1,chips:100000}));
  const history=[{update_id:390,message_id:410,reply_id:411,sender_id:'1',status:'applied',text:'',created_at:day+'T10:33:09Z',source_message:{date:time-56,photo:[{file_id:'fixture',file_unique_id:'fixture'}]},plan:{operations:source}}];
  const fixture={allowWrites:true,replyTo:411,op:source[0],paper:{date:day,printedGame:7,table:15,names,chipAmounts:[100000,100000,100000],selected:[true,true,true],hasSelectionMarkers:true},operations:[...source.map(o=>({...o,kind:'cancel',game:cancelGame})),...source.map(o=>({...o,game:6}))],history,master:[['NAME','CARD','CODE'],...names.map(n=>[n,'','KOREA'])],rows:[[5,46319,'14-1','5M','PARK SOO MIN','','KOREA',1],[],...names.map((n,i)=>[i?'':7,46319,'15-1','5M',n,'','KOREA',1])],stamp:time};
  const fixed=await run('이건 6번게임이지','correction',fixture);
  assert.ifError(fixed.failure);assert.equal(fixed.job.status,'applied',fixed.job.reply_text);
  assert.equal(fixed.writes,1);assert.deepEqual(fixed.job.plan.operations.filter(o=>o.kind==='cancel').map(o=>o.game),[7,7,7]);
  const games=fixed.load('./accounting-context').sheetContext(fixed.daily,fixture.master,day).games;
  const target=games.find(g=>g.gameNumber===6);assert(target);assert.equal(target.tableNumber,15);assert.deepEqual(target.players.map(p=>[p.name,p.buyins]),names.map(n=>[n,1]));
  assert(!games.some(g=>g.gameNumber===7));assert.equal(games.find(g=>g.gameNumber===5).players[0].buyins,1);
  assert.match(fixed.job.reply_text,/6번 게임/);
  const {correctedOperations}=fixed.load('./accounting-context');
  assert.throws(()=>correctedOperations(fixture.operations,'이건 6번게임이지',fixture.master,[],{...history[0],plan:{operations:[...source,{...source[0],game:8}]}}),/기존 게임 번호/);
 }

 // Oct 24 messages 436/438/444: an unapproved OCR registration for the
 // circled THOMAS blocked two verified master players, including YANG JUNMO.
 // Replay the real handler with local Sheets/Telegram doubles only.
 const swapDay='2026-10-24',swapTime=Date.parse(swapDay+'T22:09:42+07:00')/1000;
 const swapMaster=[['NAME','CARD','CODE'],['YUN SANG WOO','4407','KOREA'],['YANG JUNMO','','KOREA'],['LEE SUNG WON','','KOREA']];
 const protectedRows=[[5,46319,'5-2','5M','PARK SOO MIN','','KOREA',1],[],[6,46319,'13-2','5M','BAEK JAE HUI','','KOREA2',1],[],[9,46319,'13-3','5M','YUN SANG WOO','','KOREA',1],['',46319,'13-3','5M','LEE SUNG WON','','KOREA',1]];
 const swapBase={kind:'add',date:swapDay,game:11,printedGame:12,table:13,blind:'5M',buyins:1,chips:100000};
 const thomas={kind:'register',player:'THOMAS VAN NEDERVELDE',agency:'KOREA'};
 for(const [player,handwrittenGame,caption] of [['YUN SANG WOO',11,''],['YANG JUNMO',4,'11번게임']]){
  const paper={date:swapDay,table:13,printedGame:12,handwrittenGame,headerCorrections:[{field:'game',value:handwrittenGame}],names:['NGUYEN TRONG NAM HUNG','TRAN DINH LOC','NGUYEN KHAC DUNG',player,'TRAN MINH HIEU B','LEE SUNGWON','HUYNH NGOC THINH','MIAO JINMING','THOMAS VAN NEDERVELDE'],chipAmounts:Array(9).fill(100000),selected:[false,false,false,true,false,true,false,false,true],crossedOut:Array(9).fill(false),hasSelectionMarkers:true};
  const operations=[thomas,...[player,'LEE SUNG WON','THOMAS VAN NEDERVELDE'].map(player=>({...swapBase,player}))];
  const fixture={allowWrites:true,op:operations[1],paper,operations,history:[],master:swapMaster,rows:protectedRows.map(r=>[...r]),stamp:swapTime};
  const fixed=await run(caption,'photo',fixture);
  assert.ifError(fixed.failure);assert.equal(fixed.job.status,'applied',fixed.job.reply_text);
  assert.equal(fixed.writes,1);assert.deepEqual(fixed.daily.slice(2,2+protectedRows.length),protectedRows,'manual games 5/6 and earlier game 9 remain unchanged');
  assert.deepEqual(fixed.job.plan.operations.map(o=>o.player).sort(),[player,'LEE SUNG WON'].sort());
  assert(fixed.job.plan.operations.every(o=>o.game===11));
  assert(!fixed.job.plan.changes.some(c=>c.range.includes('플레이어 명단')),'no inferred KOREA registration');
  assert.match(fixed.job.plan.pendingQuestion,/THOMAS VAN NEDERVELDE.*소속 코드/);
  assert(!fixed.job.reply_text.includes('새로 등록할 선수 이름'));
  assert.match(fixed.job.reply_text,/11번 게임/);
  assert.equal(fixed.events.filter(e=>e.method==='sendMessage').length,1,'one receipt updated to a partial result');
  const repeat=await run(caption,'photo',{...fixture,rows:Array.from(fixed.daily.slice(2),r=>r||[])});
  assert.ifError(repeat.failure);assert.equal(repeat.writes,0,'same corrected roster must not duplicate players');
  assert.deepEqual(repeat.daily,Array.from(fixed.daily,r=>r||[]));
  const {isolateUnapprovedRegistrations}=fixed.load('./accounting-followup');
  const blocked=isolateUnapprovedRegistrations([thomas,{...swapBase,player:thomas.player}],caption,swapMaster);
  assert.equal(blocked.operations.length,0);assert.equal(blocked.deferredRegistrations.length,1);
  const authorized=isolateUnapprovedRegistrations([thomas],'THOMAS VAN NEDERVELDE 신규 등록 KOREA',swapMaster);
  assert.equal(authorized.operations.length,1,'explicit named registration retains the existing authorization path');
  assert.equal(isolateUnapprovedRegistrations([thomas],caption,swapMaster,'',[{content:'신규 선수 기본 코드는 KOREA'}]).operations.length,0,'default agency alone never authorizes a photo registration');
  const replacement=[{...swapBase,kind:'cancel',player:'YUN SANG WOO'},thomas,{...swapBase,player:thomas.player}];
  const held=isolateUnapprovedRegistrations(replacement,caption,swapMaster);
  assert(fixed.load('./accounting-corrections').correctionBlocked(replacement,held.operations,held.question),'unverified replacement must not delete the existing player');
 }

 // Staff-only app captures and work schedules must produce NO outgoing message
 // or emoji, even if the model invents an accounting operation or question.
 const shared={history:[],rows:[],master:[['NAME','CARD','CODE']],redeliver:true};
 const outgoing=r=>r.events.filter(e=>['sendMessage','editMessageText','setMessageReaction'].includes(e.method));
 for(const documentType of ['phone_game','other'])for(const caption of ['', '이번 주 근무표입니다', '어플 캡처 직원 공유용', '답변하지 마']){
  const r=await run(caption,'photo',{...shared,document:documentType==='other',response:{documentType,operations:[op],question:'몇 번 게임인가요?',referenceSummary:'직원 공유 자료',memory:null}});
  assert.ifError(r.failure);assert.equal(r.job.status,'ignored');assert.equal(r.job.reply_text,'');assert.deepEqual(outgoing(r),[]);
  assert.equal(r.writes,0);assert.equal(r.job.plan.operations.length,0);assert.equal(r.job.plan.pendingQuestion,null);assert.equal(r.job.plan.referenceOnly,true);assert.equal(r.ai,1,'redelivery must not reprocess');
 }
 const asked=await run('@dream_poker_reservation_bot 이 근무표 확인해줘','photo',{...shared,response:{documentType:'other',operations:[],question:null,referenceSummary:'표에 기재된 근무 시작은 오후 3시예요.',memory:null}});
 assert.ifError(asked.failure);assert.equal(asked.job.reply_text,'표에 기재된 근무 시작은 오후 3시예요.');assert.equal(outgoing(asked).length,1);assert.equal(asked.writes,0);
 const edited=await run('','photo',{...shared,edited:true});assert.ifError(edited.failure);assert.equal(edited.job.status,'ignored');assert.deepEqual(outgoing(edited),[]);assert.equal(edited.ai,0);
 const unread=await run('','photo',{...shared,classificationFailure:true});assert(unread.failure);assert.equal(unread.job.status,'failed');assert.equal(unread.job.reply_text,'');assert.equal(unread.job.plan.silentUnclassifiedPhoto,true);assert.deepEqual(outgoing(unread),[]);assert.equal(unread.writes,0);
 const askedFailure=await run('@dream_poker_reservation_bot 확인해줘','photo',{...shared,classificationFailure:true});assert(askedFailure.failure);assert(askedFailure.job.reply_text);assert.equal(outgoing(askedFailure).length,1);
 const fnb=await run('','photo',{...shared,response:{documentType:'fnb',operations:[],question:'영수증 금액이 얼마인가요?',memory:null}});assert.ifError(fnb.failure);assert.equal(fnb.job.status,'review');assert.equal(fnb.events.filter(e=>e.method==='sendMessage').length,1);assert.equal(fnb.job.reply_text,'영수증 금액이 얼마인가요?');assert.equal(fnb.writes,0);
 const knownFailure=await run('','photo',{...shared,verificationFailure:true});assert(knownFailure.failure);assert.equal(knownFailure.job.status,'failed');assert(knownFailure.job.reply_text);assert.equal(knownFailure.events.filter(e=>e.method==='sendMessage').length,1);assert.equal(knownFailure.writes,0);
 const request=status.load('./accounting-agent').explicitPhotoRequest;
 for(const t of ['근무표 요약해줘','@dream_poker_reservation_bot 확인해줘','오늘 3시 출근 맞아?'])assert(request(t));
 for(const t of ['내일 근무표','어플 캡처 직원 공유용','답변하지 마',''])assert(!request(t));
 const receipt=await run('','photo',{history:[],rows:[[9,46318,'14-1','5M','PARK SOO MIN','','KOREA',2]],master:[['NAME','CARD','CODE'],['PARK SOO MIN','','KOREA']],paper:{...paper,table:14,printedGame:9},operations:[op]});
 assert.ifError(receipt.failure);assert.equal(receipt.job.status,'applied');assert.equal(receipt.events.filter(e=>e.method==='sendMessage').length,1);assert(receipt.events.find(e=>e.method==='sendMessage').aiCallsAtSend>0,'classify before any receipt reply');assert.equal(receipt.writes,0);

 const absentOp={...op,possibleBustOut:true,chips:null};
 const missing={update_id:370,message_id:370,reply_id:870,sender_id:'1',text:'리바인 사진',status:'applied',created_at:date+'T12:49:00Z',source_message:{date:stamp-60,photo:[{file_id:'fixture'}]},plan:{pendingQuestion:'PARK SOO MIN님이 리바인 명단에서 보이지 않아 버스트아웃했을 가능성이 있어요. TD에게 최종 누적 바이인 수를 확인해주시겠어요?',unverifiedOperations:[absentOp]}};
 const bustFixture={history:[missing],replyTo:870,rows:[[9,46318,'14-1','5M','PARK SOO MIN','','KOREA',2]],master:[['NAME','CARD','CODE'],['PARK SOO MIN','','KOREA']]};
 const busted=await run('버스트아웃한거야','bust', {...bustFixture,redeliver:true});
 assert.ifError(busted.failure);assert.equal(busted.ai,0);assert.equal(busted.writes,0);assert.equal(busted.job.plan.bustFollowup.busted,true);assert.match(busted.job.reply_text,/누적 바이인 수만/);assert(!busted.job.reply_text.includes('가능성'));assert.equal(busted.events.filter(e=>e.method==='sendMessage').length,1);
 const vi=await run('đã bị loại rồi','bust',bustFixture);assert.ifError(vi.failure);assert.equal(vi.job.plan.bustFollowup.busted,true);assert.equal(vi.writes,0);
 const follow={...busted.job,update_id:380,message_id:380,reply_id:880};
 const number=await run('2바인','bust',{...bustFixture,history:[follow,missing],replyTo:870,redeliver:true});
 assert.ifError(number.failure);assert.equal(number.ai,0);assert.equal(number.job.plan.bustFollowup.phase,'resolved');assert.equal(number.writes,0);assert.equal(number.events.filter(e=>e.method==='sendMessage').length,1);
 for(const answer of ['버스트아웃한거야','da bi loai roi']){
  const repeated=await run(answer,'bust',{...bustFixture,history:[follow,missing],replyTo:870});assert.ifError(repeated.failure);assert.equal(repeated.ai,0);assert.equal(repeated.events.length,0);assert.equal(repeated.writes,0);
 }
 const corrected=await run('아직 게임 중','bust',{...bustFixture,history:[follow,missing],replyTo:880});assert.ifError(corrected.failure);assert.equal(corrected.job.plan.bustFollowup.busted,false);assert.equal(corrected.writes,0);
 for(const answer of ['KIM DEOK WOO는 3바인','오늘 저녁 뭐 먹어?']){
  const unrelated=await run(answer,'bust',bustFixture);assert.ifError(unrelated.failure);assert.equal(unrelated.ai,0);assert.equal(unrelated.writes,0);assert.equal(unrelated.events.length,0);
 }
 const raised=await run('tổng 3 buy-in','bust',{...bustFixture,history:[follow,missing],replyTo:880,allowWrites:true,redeliver:true});assert.ifError(raised.failure);assert.equal(raised.job.plan.bustFollowup.phase,'resolved');assert.equal(raised.writes,1);assert.equal(raised.daily[2][7],3);assert.equal(raised.ai,0);
 const durable=number.jobs.find(j=>j.message_id===370);assert.equal(durable.plan.bustFollowup.phase,'resolved');
 const oldReply=await run('2바인','bust',{...bustFixture,history:[durable],replyTo:870});assert.ifError(oldReply.failure);assert.equal(oldReply.events.length,0);assert.equal(oldReply.ai,0);
 const resolved={...number.job,update_id:390,message_id:390,reply_id:890};
 const late=await run('2바인','bust',{...bustFixture,history:[resolved,follow,missing],replyTo:870});assert.ifError(late.failure);assert.equal(late.ai,0);assert.equal(late.events.length,0);assert.equal(late.writes,0);
 const bot=await run('버스트아웃한거야','bust',{...bustFixture,fromBot:true});assert.ifError(bot.failure);assert.equal(bot.events.length,0);assert.equal(bot.ai,0);assert.equal(bot.writes,0);
 const {bustAnswer,finalBuyins}=late.load('./accounting-bust-followup');
 assert.equal(bustAnswer('chưa bust'),'playing');assert.equal(finalBuyins('tổng 3 buy-in'),3);assert.equal(finalBuyins('아마 3바인'),null);
 const {followupContext}=late.load('./accounting-followup');
 const plain={text:'버스트아웃한거야',from:{id:1},date:stamp};assert.equal(followupContext([missing],plain,[]).message_id,370);
 assert.equal(followupContext([missing,{...missing,message_id:371,plan:{...missing.plan,pendingQuestion:missing.plan.pendingQuestion.replace('PARK SOO MIN','OTHER'),unverifiedOperations:[{...absentOp,player:'OTHER'}]}}],plain,[]),null);
 const another={...resolved,plan:{...resolved.plan,pendingQuestion:'OTHER님은 총 몇 바인인가요?',unverifiedOperations:[{...absentOp,player:'OTHER'}]}};
 assert.equal(followupContext([another,durable],{...plain,reply_to_message:{message_id:870}},[]).message_id,370,'old reply must not jump to another player');
 console.log('Bust follow-up actual-handler replay passed: acknowledgement without writes/AI, count completion, duplicate webhook, repeated answers, scoped player, unrelated text, corrections, resolved reply chain, Korean/Vietnamese fallback.');
 console.log('Actual handler replay passed: shared screenshots/schedules stay silent, explicit questions respond, receipt notification follows classification, unknown-image failures stay silent, duplicate delivery is ignored, and existing ledger protections remain.');
})();
