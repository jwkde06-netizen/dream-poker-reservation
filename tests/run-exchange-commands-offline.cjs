const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..'),guard=path.join(__dirname,'offline-network-guard.cjs');
const env={PATH:process.env.PATH,EXCHANGE_TEST_BUILD:path.join(root,'.test-build')};
function run(args,extra={}){const r=spawnSync(process.execPath,args,{cwd:root,env:{...env,...extra},stdio:'inherit',timeout:90000});if(r.error)console.error(r.error);if(r.status!==0)process.exit(r.status||1);}
const tsc=['node_modules/typescript/bin/tsc','--target','ES2020','--module','commonjs','--moduleResolution','node','--esModuleInterop','--skipLibCheck','--strict'];
run([...tsc,'--outDir','.test-build','lib/exchange-agent.ts','lib/exchange-onboarding.ts']);
for(const file of ['exchange','exchange-webhook','exchange-settings','exchange-sql','exchange-vnd-overdraft','exchange-commands'])run(['--require',guard,'tests/'+file+'.cjs']);
run([...tsc,'--outDir','.test-menu-build','app/api/exchange/webhook/route.ts','app/api/exchange/diagnostics/route.ts']);
run(['--require',guard,'tests/exchange-menu.cjs'],{EXCHANGE_TEST_BUILD:path.join(root,'.test-menu-build')});
console.log('Current command-only exchange checks passed. No live network, AI or ledger writes.');
