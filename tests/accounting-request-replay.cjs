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
async function run(text,mode='status'){
 const jobs=[
 {update_id:349,message_id:349,sender_id:'1',status:'review',plan:{pendingQuestion:'몇 번 게임인가요?'},created_at:date+'T12:37:00Z',source_message:{date:stamp-780,photo:[{file_id:'fixture',file_unique_id:'fixture'}]}},
 {update_id:357,message_id:357,sender_id:'1',status:'review',plan:{contextMessageId:349,photoSourceMessageId:349,pendingQuestion:question},created_at:date+'T12:47:00Z',source_message:{date:stamp-180,photo:[{file_id:'fixture',file_unique_id:'fixture'}]}}
 ];
 if(mode==='status')jobs.push({update_id:360,message_id:360,status:'applied',plan:{contextMessageId:357,operations:[op]},created_at:date+'T12:48:00Z'});
 const master=[['NAME','CARD','CODE'],['PARK SOO MIN','','KOREA']];
 const formula=Array(15).fill('');for(const i of [5,6,8,9,10,11,12,13,14])formula[i]='=ARRAYFORMULA(test)';
 const daily=[['GAME'],formula,[9,46318,'14-1','5M','PARK SOO MIN','','KOREA',2]];
 const events=[];let writes=0,ai=0;
 function query(table){
  let filters=[],patch=null,sort=null,limit=Infinity,one=false;
  const q={
   select(){return q;},upsert(value){if(!jobs.some(j=>j.update_id===value.update_id))jobs.push({...value,created_at:date+'T12:50:00Z'});return q;},
   update(value){patch=value;return q;},
   eq(k,v){filters.push(r=>r[k]===v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},
   gte(){return q;},order(k,o){sort=[k,o];return q;},limit(n){limit=n;return q;},single(){one=true;return q;},maybeSingle(){one=true;return q;},
   then(resolve,reject){try{let rows=table==='dream_accounting_rules'?[]:jobs.filter(r=>filters.every(f=>f(r)));if(sort)rows.sort((a,b)=>(a[sort[0]]>b[sort[0]]?1:-1)*(sort[1].ascending?1:-1));rows=rows.slice(0,limit);if(patch)rows.forEach(r=>Object.assign(r,patch));return Promise.resolve({data:one?rows[0]:rows,error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}
  };return q;
 }
 const tg=async(method,data)=>{events.push({method,...data});if(method==='getFile')return {file_path:'fixture.jpg'};if(method==='getChatMember')return {status:'member'};return {message_id:900};};
 const fetch=async(url,init={})=>{
  if(url.startsWith('https://sheets.googleapis.com')){
   assert(!init.body,'no Sheets mutation permitted');const u=new URL(url);
   const values=u.searchParams.getAll('ranges').map(r=>r.includes('플레이어')?master:r.includes('일일 입력')?(r.endsWith('O2')?daily.slice(0,2):daily):[]);
   return {ok:true,json:async()=>({valueRanges:values.map(values=>({values}))})};
  }
  if(url.startsWith('https://api.telegram.org/file/'))return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2]).buffer};
  if(url.includes('ai-gateway')){
   ai++;const body=JSON.parse(init.body);const columns=body.max_tokens===2500||body.max_tokens===4000;
   const result=columns?{documents:[paper]}:{documentType:'paper_game',operations:[op],question:'9번 게임의 용지 번호를 확인해주세요.',memory:null};
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
 await load('./accounting-agent').handle({update_id:400,message:{message_id:400,date:stamp,chat:{id:-1,type:'supergroup'},from:{id:1},text}});
 return {job:jobs.find(j=>j.message_id===400),events,ai,load};
}
module.exports=(async()=>{
 const status=await run('@dream_poker_reservation_bot 시트에 다 입력된거야?');
 assert.equal(status.job.reply_text,'✅ 반영 확인 1건');assert.equal(status.ai,0);
 assert.equal(status.events.filter(e=>e.method==='sendMessage').length,1);
 assert(!/모델|15건/.test(status.job.reply_text));
 const {sheetStatusQuestion}=status.load('./accounting-conversation');
 for(const text of ['사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.\n규칙저장','처리 결과 안내\n사진 접수 시 ‘사진 확인했어요. 입력 중입니다.’를 한 번 보낸다.'])assert.equal(sheetStatusQuestion(text),false);
 const rebuy=await run('네','rebuy');
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
 console.log('Actual handler replay passed: tagged status, chain deduplication, no AI/no sheet writes for status, rebuy confirmation before guards, persisted binding, rule/status separation.');
})();
