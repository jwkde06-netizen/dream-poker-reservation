const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const {ruleView,gameMapping}=require('../.test-build/accounting-rules-display');
const content='게임번호 대응: '+JSON.stringify({date:'2026-10-21',table:13,printedGame:8,game:7});
assert.deepEqual(ruleView({id:10,kind:'instruction',content}),{category:'게임번호 보정',title:'13번 테이블 · 7번째 게임',lines:['2026-10-21에만 적용','인쇄 8번 → 실제 7번째 게임']});
assert.equal(gameMapping('게임번호 대응: {}'),null);
let admin=false,rows=[{id:1,kind:'instruction',content:'기존 규칙',active:true}],locked=false;
const client={rpc:async(name)=>{locked=name.endsWith('acquire');return {data:true}},from:()=>{
 let op='read',patch,filters=[],single=false,head=false;
 const q={select:(s,o)=>{head=!!o?.head;return q},eq:(k,v)=>{filters.push([k,v]);return q},order:()=>q,single:()=>{single=true;return q},insert:v=>{op='insert';patch=v;return q},update:v=>{op='update';patch=v;return q},then:resolve=>{
 let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(op==='insert'){const r={id:rows.length+1,...patch};rows.push(r);found=[r]}
 if(op==='update')found.forEach(r=>Object.assign(r,patch));return Promise.resolve(resolve({data:single?found[0]:found,count:head?found.length:null}));}};return q;
}};
const code=ts.transpileModule(fs.readFileSync('app/api/accounting/rules/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const routeExports={};
vm.runInNewContext(code,{exports:routeExports,process:{env:{}},Error,Number,JSON,require:n=>n==='next/server'?{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}}:n==='@supabase/supabase-js'?{createClient:()=>client}:n==='crypto'?{randomUUID:()=> 'test-owner'}:n.endsWith('/telegram')?{requireAdmin:async()=>admin?{id:'admin'}:null,projectUrl:'test'}:n.endsWith('/accounting-memory')?require('../.test-build/accounting-memory'):require('../.test-build/accounting-rules-display')});
(async()=>{
 const post=b=>routeExports.POST({json:async()=>b});
 assert.equal((await post({action:'delete',id:1})).status,403);assert.equal(rows[0].active,true);
 admin=true;assert.equal((await post({action:'edit',id:1})).status,400);
 assert.equal((await post({action:'edit',id:1,before:'old',beforeKind:'instruction',content:'새 규칙',kind:'instruction'})).status,409);assert.equal(rows[0].content,'기존 규칙');
 assert.equal((await post({action:'edit',id:1,before:'기존 규칙',beforeKind:'instruction',content:'새 규칙',kind:'instruction'})).status,200);
 assert.equal(rows[0].content,'새 규칙');assert.equal(locked,false);
 assert.equal((await post({action:'add',kind:'instruction',content:'5층은 사용하지 않는다.'})).status,200);assert.equal(rows.length,2);
 assert.equal((await post({action:'delete',id:1,before:'새 규칙',beforeKind:'instruction'})).status,200);assert.equal(rows[0].active,false);assert.equal(rows.length,2);
 assert.equal((await post({action:'add',kind:'instruction',content:'token 변경'})).status,400);
 console.log('Rule presentation, admin authorization, add/edit/soft-delete and concurrent edit checks passed');
})().catch(e=>{console.error(e);process.exitCode=1});
