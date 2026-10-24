const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync('lib/staff-auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod,mod.exports);
const {resolveStaffEmail,staffAuthIssue,staffAuthCopy}=mod.exports;
(async()=>{
 let called;const client={rpc:async(name,args)=>{called={name,args};return{data:'owner@example.com',error:null}}};
 assert.equal(await resolveStaffEmail(client,'  ADMIN  '),'owner@example.com');
 assert.deepEqual(called,{name:'resolve_login_email',args:{p_username:'admin'}});
 assert.equal(await resolveStaffEmail(client,'OWNER@EXAMPLE.COM'),'owner@example.com');
 assert.equal(await resolveStaffEmail({rpc:async()=>({data:null,error:null})},'unknown'),null);
 await assert.rejects(()=>resolveStaffEmail({rpc:async()=>({error:Error('offline')})},'admin'),/offline/);
 assert.equal(staffAuthIssue({code:'invalid_credentials'}),'credentials');
 assert.equal(staffAuthIssue({status:429}),'rate');
 assert.equal(staffAuthIssue(new Error('Failed to fetch')),'network');
 for(const lang of ['en','ko','vi'])assert.ok(staffAuthCopy[lang].credentials&&staffAuthCopy[lang].reset&&staffAuthCopy[lang].saved);
 assert.ok(!/[가-힣]/.test(Object.values(staffAuthCopy.en).join('')));
 console.log('Staff auth: legacy username resolution, email normalization, unknown account, connection failure and localized errors passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
