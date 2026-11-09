const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const out=path.resolve(process.argv[3]||path.join(root,'audit-results'));
fs.mkdirSync(out,{recursive:true});
const guard=path.join(__dirname,'offline-network-guard.cjs');
const env={PATH:'/usr/bin:/bin',EXCHANGE_TEST_BUILD:path.join(root,'.test-build')};
const results=[];
function run(name,args) {
  const r=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:5*1024*1024});
  fs.writeFileSync(path.join(out,name+'.log'),[r.stdout||'',r.stderr||'',r.error?String(r.error):''].join('\n'));
  results.push({name,exitCode:r.status,signal:r.signal,error:r.error?String(r.error):null,
    command:[process.execPath,...args],cwd:root});
  console.log(name+': '+(r.status===0?'PASS':'FAIL'));
}
run('typecheck',['node_modules/typescript/bin/tsc','--target','ES2020','--module','commonjs',
  '--moduleResolution','node','--esModuleInterop','--skipLibCheck','--strict','--outDir','.test-build',
  'lib/exchange-agent.ts','lib/exchange-onboarding.ts','lib/accounting-memory.ts','lib/accounting-plan.ts',
  'lib/accounting-ai-response.ts','lib/accounting-decision.ts']);
if(results[0].exitCode===0) {
  run('typecheck-exchange-route',['node_modules/typescript/bin/tsc','--target','ES2020','--module','commonjs',
    '--moduleResolution','node','--esModuleInterop','--skipLibCheck','--strict','--noEmit','app/api/exchange/webhook/route.ts']);
  run('accounting-agent-syntax',['-e',"const ts=require('typescript'),fs=require('node:fs');const r=ts.transpileModule(fs.readFileSync('lib/accounting-agent.ts','utf8'),{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}});if(r.diagnostics?.length){console.error(r.diagnostics);process.exit(1)}console.log('Syntax/transpile only; not a full accounting typecheck');"]);
  for(const file of ['exchange.cjs','exchange-webhook.cjs','exchange-krw-cash.cjs','exchange-confirmation.cjs',
    'exchange-krw-movement.cjs','exchange-google.cjs','exchange-receipt.cjs','exchange-settings.cjs','exchange-sql.cjs','exchange-vnd-overdraft.cjs']) {
    run(file.replace('.cjs',''),['--require',guard,'tests/'+file]);
  }
  run('exchange-audit-regressions',['--require',guard,path.join(__dirname,'exchange-audit-regressions.cjs')]);
  for(const file of ['exchange-policy-regressions','accounting-staff-learning','accounting-cancel-compact','accounting-lock-budget-audit']){
    run(file,['--require',guard,'tests/'+file+'.cjs']);
  }
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
