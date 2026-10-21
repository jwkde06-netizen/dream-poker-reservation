const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const js = ts.transpileModule(fs.readFileSync("app/api/telegram/route.ts", "utf8"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}
}).outputText;
async function run({admin=true, target="", webhook="", lookupError=null}) {
  const calls=[];
  const exports={};
  const chat={id:-123456,title:"Test group",type:"supergroup"};
  vm.runInNewContext(js, {exports, process:{env:{}}, require(name) {
    if(name==="next/server")return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
    if(name==="@supabase/supabase-js")return {createClient:()=>({rpc:async()=>({data:target,error:lookupError})})};
    if(name==="../../../lib/telegram")return {
      requireAdmin:async()=>admin,projectUrl:"https://example.test",publicKey:"public",
      tg:async(method,payload)=>{calls.push({method,payload});if(method==="getChat")return chat;
        if(method==="getWebhookInfo")return {url:webhook};
        if(method==="getUpdates")return [{message:{chat}}];
        throw Error("Unexpected mutation: "+method);
      }
    };
    throw Error(name);
  }});
  const response=await exports.GET({headers:{get:()=>"Bearer test"}});
  return {response,calls};
}
(async()=>{
  let r=await run({target:"-123456",webhook:"https://existing.test/webhook"});
  assert.equal(r.response.status,200);
  assert.equal(r.response.body.groups[0].title,"Test group");
  assert.deepEqual(r.calls.map(c=>c.method),["getChat"]);
  r=await run({webhook:"https://existing.test/webhook"});
  assert.equal(r.response.status,409);
  assert.deepEqual(r.calls.map(c=>c.method),["getWebhookInfo"]);
  r=await run({});
  assert.equal(r.response.status,200);
  assert.deepEqual(r.calls.map(c=>c.method),["getWebhookInfo","getUpdates"]);
  r=await run({admin:false});
  assert.equal(r.response.status,403);
  assert.equal(r.calls.length,0);
  r=await run({lookupError:{message:"unavailable"}});
  assert.equal(r.response.status,503);
  assert.equal(r.calls.length,0);
  console.log("PASS: saved group, webhook preservation, polling fallback, authorization, lookup failure");
})().catch(error=>{console.error(error);process.exitCode=1});
