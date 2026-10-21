const {execFileSync}=require('node:child_process');
const {readdirSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const files=readdirSync(join(root,'lib')).filter(x=>x.endsWith('.ts')).map(x=>'lib/'+x);
rmSync(join(root,'.test-build'),{recursive:true,force:true});
execFileSync(process.execPath,['node_modules/typescript/bin/tsc',...files,'--outDir','.test-build','--module','commonjs','--target','es2020','--moduleResolution','node','--esModuleInterop','--skipLibCheck','--strict'],{cwd:root,stdio:'inherit'});
for(const file of readdirSync(__dirname).filter(x=>x.endsWith('.cjs')&&x!=='run.cjs').sort())execFileSync(process.execPath,[join(__dirname,file)],{cwd:root,stdio:'inherit'});
