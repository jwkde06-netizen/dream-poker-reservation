
const fs=require('node:fs'),path=require('node:path'),{stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'..');
function compile(source){
 const js=stripTypeScriptTypes(source,{mode:'transform'});
 const names=[...js.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
 return js.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,f)=>"const {"+n+"}=require('"+f+"');").replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/g,'')+'\nObject.assign(exports,{'+names.join(',')+'});';
}
fs.mkdirSync(root+'/.test-build',{recursive:true});
for(const n of ['accounting-corrections','accounting-plan','accounting-context','accounting-vision'])fs.writeFileSync(root+'/.test-build/'+n+'.js',compile(fs.readFileSync(root+'/lib/'+n+'.ts','utf8')));
require('./accounting-roster-upgrade.cjs');
require('./accounting-prewrite-conflict.cjs');
