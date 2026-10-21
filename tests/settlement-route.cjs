const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
let admin=false,canConfirm=false,rows=[];
const report={roomId:'dream',start:'2026-10-19',end:'2026-10-25',sourceHash:'fresh',canConfirm:false,history:[]};
const client={from:()=>({insert:v=>{rows.push(v);return {select:()=>({single:async()=>({data:{id:'saved'}})})}}})};
const route={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/accounting/settlement/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:route,process:{env:{}},Error,Number,JSON,URL,require:n=>{
 if(n==='next/server')return {NextResponse:{json:(body,o)=>({body,status:o?.status||200})}};
 if(n.endsWith('/telegram'))return {requireAdmin:async()=>admin?{id:'manager'}:null};
 if(n.endsWith('/settlement-service'))return {loadSettlement:async()=>({...report,canConfirm}),settlementDb:()=>client};
 if(n.endsWith('/settlement-domain'))return {localToday:()=> '2026-10-21',reportText:()=> '주간정산 초안'};
 return {getVercelOidcToken:async()=> 'unused'};
}});
(async()=>{
 const post=b=>route.POST({json:async()=>({day:'2026-10-21',sourceHash:'fresh',...b})});
 assert.equal((await post({action:'draft'})).status,403);assert.equal(rows.length,0);
 admin=true;assert.equal((await post({action:'draft',sourceHash:'stale'})).status,409);assert.equal(rows.length,0);
 assert.equal((await post({action:'confirm',reviewed:true})).status,409);
 canConfirm=true;assert.equal((await post({action:'confirm'})).status,409);
 assert.equal((await post({action:'draft',salary:-1})).status,400);
 assert.equal((await post({action:'draft'})).status,200);assert.equal(rows[0].created_by,'manager');assert.equal(rows[0].status,'draft');
 assert.equal((await post({action:'confirm',reviewed:true})).status,200);assert.equal(rows[1].status,'confirmed');assert.equal(rows[1].report_text,'주간정산 확정');
 console.log('Weekly route: admin-only, stale-source rejection, explicit review, salary validation, append-only draft/confirmation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
