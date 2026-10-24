const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const cache={};function mod(file){if(cache[file])return cache[file];const exports={};cache[file]=exports;vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:7}}).outputText,{exports,require:n=>n.startsWith('./')?mod('lib/'+n.slice(2)+'.ts'):require(n),Date,JSON,Number,Set,Map,Array,Error});return exports;}
const {deskPlan,sourceHash}=mod('lib/desk-ledger-plan.ts'),undo=mod('lib/desk-ledger-undo.ts'),{serial}=mod('lib/accounting-plan.ts');
const day=serial('2026-10-24'),entry=(g,n,b=1)=>[g,day,'4-1','5M',n,'=CARD','=AGENCY',b,'=RAKE','=BACK','MANUAL'];
const base={daily:[['HEAD'],entry(5,'MANUAL FIVE'),entry(6,'MANUAL SIX'),entry(12,'FIRST',3),entry('','SECOND'),[],entry(13,'NEXT')],master:[['Name'],['FIRST','','KOREA'],['SECOND','','KOREA'],['NEXT','','KOREA']],fnb:[],menu:[]};
const expected=[...base.daily[3].slice(0,5),3];
for(const operation of [{kind:'buyins',row:4,expected,buyins:2},{kind:'cancel',row:4,expected},{kind:'participant',row:4,expected,player:'NEXT',buyins:3}]){
 const plan=deskPlan(operation,base),after=undo.projectChanges(base,plan.changes),original={status:'applied',operation:{...operation,undoHash:undo.undoHash(after)},...plan};
 const reversed=undo.undoPlan(original,after),restored=undo.projectChanges(after,reversed.changes);
 assert.deepEqual(JSON.parse(JSON.stringify(restored)),base);
 const changed=structuredClone(after);changed.daily[2][7]=8;assert.throws(()=>undo.undoPlan(original,changed),/이후 기록/);
 const renamed=structuredClone(after);renamed.daily[3][4]='OTHER';assert.throws(()=>undo.undoPlan(original,renamed),/이후 기록/);
 assert.throws(()=>undo.undoPlan({...original,status:'writing'},after));
 assert.throws(()=>undo.undoPlan({...original,operation:{kind:'undo',undoHash:undo.undoHash(after)}},after));
}
const trimmed=structuredClone(base);trimmed.daily.push([],['','','','','','','','']);assert.equal(undo.undoHash(base),undo.undoHash(trimmed));
const input=JSON.stringify(base);undo.projectChanges(base,[{range:"'일일 입력'!H4",before:[[3]],values:[[2]]}]);assert.equal(JSON.stringify(base),input);
console.log('Undo: exact reversal for decrement, name correction and compacted deletion; date/formula/manual games 5/6 and neighboring games preserved; changed-source and non-applied guards passed');
module.exports=(async()=>{
 let admin=true,writes=0,current=structuredClone(base),commands=new Map(),sequence=1;
 const operation={kind:'buyins',row:4,expected,buyins:2},planned=deskPlan(operation,base);current=undo.projectChanges(base,planned.changes);
 const originalId='00000000-0000-0000-0000-000000000001';commands.set(originalId,{id:originalId,created_by:'admin',status:'applied',operation:{...operation,undoHash:undo.undoHash(current)},...planned});
 const client={from(table){assert.equal(table,'dream_desk_commands');let filters=[],update,insert;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},update(v){update=v;return q},insert(v){insert=v;return q},single:async()=>{if(insert){const id='00000000-0000-0000-0000-'+String(++sequence).padStart(12,'0'),made={id,...insert};commands.set(id,made);return {data:made}}const saved=Array.from(commands.values()).find(r=>filters.every(([k,v])=>r[k]===v));if(!saved)return {error:{message:'missing'}};if(update)Object.assign(saved,update);return {data:saved}},then(resolve,reject){return q.single().then(resolve,reject)}};return q;},rpc:async()=>({data:true})};
 function rangeValues(range){const m=range.match(/!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);assert(m);const col=v=>v.split('').reduce((n,x)=>n*26+x.charCodeAt(0)-64,0)-1,a=col(m[1]),b=col(m[3]||m[1]);return Array.from({length:Number(m[4]||m[2])-Number(m[2])+1},(_,i)=>Array.from({length:b-a+1},(_,j)=>current.daily[Number(m[2])-1+i]?.[a+j]??''));}
 const route={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/accounting/ledger/route.ts','utf8'),{compilerOptions:{module:1,target:7}}).outputText,{exports:route,Date,JSON,Error,Number,require:n=>{
  if(n==='next/server')return {NextResponse:{json:(body,o)=>({body,status:o?.status||200})}};
  if(n==='node:crypto')return require(n);
  if(n.endsWith('/telegram'))return {requireAdmin:async()=>admin?{id:'admin'}:null};
  if(n.endsWith('/desk-ledger-plan'))return mod('lib/desk-ledger-plan.ts');
  if(n.endsWith('/desk-ledger-undo'))return undo;
  if(n.endsWith('/desk-game-settings'))return mod('lib/desk-game-settings.ts');
  if(n.endsWith('/desk-ledger-view')||n.endsWith('/sheet-game-status')||n.endsWith('/settlement-intake'))return {};
  if(n.endsWith('/accounting-format'))return {prepareDateFormats:async()=>{},verifyDateDisplays:async()=>{}};
  if(n.endsWith('/accounting-agent'))return {db:()=>client,ranges:async list=>list.length===4?[current.daily,current.fnb,current.master,current.menu]:list.map(rangeValues),same:(a,b)=>JSON.stringify(a)===JSON.stringify(b),sheet:async(path,body)=>{assert.equal(path,'values:batchUpdate');writes++;current=undo.projectChanges(current,body.data);}};
  throw Error(n);
 }});
 const post=(action,id)=>route.POST({text:async()=>JSON.stringify({action,id})});
 admin=false;assert.equal((await post('undo_preview',originalId)).status,403);admin=true;assert.equal(writes,0);
 commands.get(originalId).created_by='other';assert.equal((await post('undo_preview',originalId)).status,400);assert.equal(writes,0);commands.get(originalId).created_by='admin';
 const preview=await post('undo_preview',originalId);assert.equal(preview.status,200);assert.equal(writes,0);assert.equal(preview.body.operation.kind,'undo');
 const applied=await post('apply',preview.body.id);assert.equal(applied.body.applied,true);assert.equal(writes,1);assert.equal(undo.undoHash(current),undo.undoHash(base));
 assert.equal((await post('apply',preview.body.id)).body.applied,true);assert.equal(writes,1);
 assert.equal((await post('undo_preview',originalId)).status,400);assert.equal(writes,1);
 console.log('Undo handler: admin/owner checks, read-only preview, audited inverse apply, exact readback and repeated-request idempotency passed. No external writes.');
})();
if(require.main===module)module.exports.catch(e=>{console.error(e);process.exitCode=1});
