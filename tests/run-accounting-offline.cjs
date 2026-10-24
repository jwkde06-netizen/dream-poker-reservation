
const fs=require('node:fs'),path=require('node:path'),{stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'..');
function compile(source){
 if(!stripTypeScriptTypes){const ts=require('typescript');return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;}
 const js=stripTypeScriptTypes(source,{mode:'transform'});
 const names=[...js.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)].map(m=>m[1]);
 return js.replace(/export\s*\{\s*(\w+)\s+as\s+(\w+)\s*\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,a,f)=>"exports."+a+"=require('"+f+"')."+n+";").replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,n,f)=>"const {"+n+"}=require('"+f+"');").replace(/export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/g,'')+'\nObject.assign(exports,{'+names.join(',')+'});';
}
fs.mkdirSync(root+'/.test-build',{recursive:true});
for(const n of ['accounting-memory','accounting-easy','accounting-conversation','accounting-format','accounting-corrections','accounting-plan','accounting-context','accounting-vision'])fs.writeFileSync(root+'/.test-build/'+n+'.js',compile(fs.readFileSync(root+'/lib/'+n+'.ts','utf8')));
module.exports=(async()=>{
 for(const file of ['accounting-staff-learning','accounting-vision','accounting-roster-upgrade','accounting-prewrite-conflict','accounting-cancel-compact','accounting-format','accounting-upgrade-guards','accounting-request-replay','desk-ledger','desk-ledger-inline','desk-ledger-integration','desk-scan-settings','sheet-game-status','settlement-flow'])await require('./'+file+'.cjs');
 console.log('All offline accounting checks passed');
})();
if(require.main===module)module.exports.catch(error=>{console.error(error);process.exitCode=1;});
