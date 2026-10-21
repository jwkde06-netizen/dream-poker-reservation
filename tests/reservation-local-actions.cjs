const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const records={local_reservation_alerts:[],local_reservation_actions:[]},calls=[];
let memberStatus='member',failDb=false;
class Query{
 constructor(table){this.table=table;this.filters=[];this.mode='select';this.maximum=Infinity;}
 select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}
 order(k){this.orderKey=k;return this;}limit(n){this.maximum=n;return this;}
 maybeSingle(){return this.run(true);}single(){return this.run(true);}
 upsert(value,options){this.mode='upsert';this.value=value;this.options=options;return this;}
 update(value){this.mode='update';this.value=value;return this;}
 then(a,b){return this.run(false).then(a,b);}
 async run(single){
  if(failDb)return{data:null,error:Error('db failure')};
  const table=records[this.table];
  if(this.mode==='upsert'){
   const keys=this.options.onConflict.split(','),old=table.find(r=>keys.every(k=>r[k]===this.value[k]));
   if(old){if(!this.options.ignoreDuplicates)Object.assign(old,this.value);}
   else table.push({id:'00000000-0000-0000-0000-'+String(table.length+1).padStart(12,'0'),state:'pending',...this.value});
   return{data:null,error:null};
  }
  let rows=table.filter(r=>this.filters.every(f=>f(r)));
  if(this.mode==='update'){rows.forEach(r=>Object.assign(r,this.value));return{data:null,error:null};}
  if(this.orderKey==='version')rows.sort((a,b)=>b.version-a.version);
  rows=rows.slice(0,this.maximum);return{data:single?(rows[0]||null):rows,error:null};
 }
}
const tg=async(method,body)=>{calls.push({method,body});if(method==='getChatMember')return{status:memberStatus};return{message_id:body.message_id||77};};
const moduleBox={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/reservation-local-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(code,{exports:moduleBox.exports,module:moduleBox,process:{env:{LOCAL_RESERVATION_TELEGRAM_CHAT_ID:'-12345678',SUPABASE_SERVICE_ROLE_KEY:'test'}},require:name=>{
 if(name==='@supabase/supabase-js')return{createClient:()=>({from:table=>new Query(table)})};
 if(name==='./telegram')return{projectUrl:'https://example.invalid',tg};throw Error(name);
}});
const api=moduleBox.exports,id='a'.repeat(32),text='DREAM POKER · RESERVATION\nName: TEST ONLY\nStatus: Waiting';
const callback=(action='confirm',version=0,chat=-12345678,message=77)=>({callback_query:{id:'callback-test',data:`lr:${action}:${id}:${version}`,from:{id:42,first_name:'Desk'},message:{chat:{id:chat},message_id:message}}});
(async()=>{
 const keyboard=api.reservationKeyboard(id+':0',text).inline_keyboard[0];
 assert.deepEqual(Array.from(keyboard,b=>b.text),['CONFIRM','CONTACT DESK']);assert.ok(keyboard.every(b=>!b.url&&b.callback_data.length<=64));
 await api.deliverReservationAlert(text,id+':0');
 assert.equal(calls.filter(c=>c.method==='sendMessage').length,1);
 assert.equal(await api.handleReservationCallback({message:{text:'ordinary ledger message'}}),false);
 await api.handleReservationCallback(callback('confirm',0,-999));assert.equal(records.local_reservation_actions.length,0);
 await api.handleReservationCallback(callback('confirm',0,-12345678,999));assert.equal(records.local_reservation_actions.length,0);
 memberStatus='left';await api.handleReservationCallback(callback());assert.equal(records.local_reservation_actions.length,0);memberStatus='member';
 await api.handleReservationCallback(callback());await api.handleReservationCallback(callback());assert.equal(records.local_reservation_actions.length,1);
 await api.handleReservationCallback(callback('contact'));assert.equal(records.local_reservation_actions.length,2);
 assert.equal((await api.pendingReservationActions()).length,2);
 const confirmed=text.replace('Waiting','Confirmed');await api.deliverReservationAlert(confirmed,id+':1');
 assert.equal(calls.filter(c=>c.method==='sendMessage').length,1);
 const edited=calls.find(c=>c.method==='editMessageText');assert.equal(edited.body.message_id,77);assert.equal(edited.body.reply_markup.inline_keyboard[0][0].text,'CONFIRMED ✓');
 await api.handleReservationCallback(callback('confirm',0));assert.equal(records.local_reservation_actions.length,2);
 await api.handleReservationCallback(callback('done',1));assert.equal(records.local_reservation_actions.length,2);
 const action=records.local_reservation_actions[0];await api.acknowledgeReservationAction(action.id,true,'Confirmed.');await api.acknowledgeReservationAction(action.id,true,'Confirmed.');
 assert.equal((await api.pendingReservationActions()).length,1);
 failDb=true;await assert.rejects(()=>api.handleReservationCallback(callback('contact',1)));failDb=false;
 console.log('Reservation button checks passed: two inline buttons, staff group, membership, stale message, duplicate action, same-message update and saved result.');
})().catch(e=>{console.error(e);process.exitCode=1;});
