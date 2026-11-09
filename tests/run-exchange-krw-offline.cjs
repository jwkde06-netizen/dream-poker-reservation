const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// No inherited credentials; the test process also denies real network requests.
const env={PATH:process.env.PATH,EXCHANGE_TEST_BUILD:path.join(root,'.test-build')};
const compile=['node_modules/typescript/bin/tsc','--target','ES2020','--module','commonjs',
 '--moduleResolution','node','--esModuleInterop','--skipLibCheck','--strict','--outDir','.test-build',
 'lib/exchange-agent.ts'];
for(const args of [compile,['--require',path.join(__dirname,'offline-network-guard.cjs'),
 path.join(__dirname,'exchange-krw-movement.cjs')]]){
 const result=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit',timeout:60000});
 if(result.error)console.error(result.error);
 if(result.status!==0){process.exitCode=1;break;}
}
