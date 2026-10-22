const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {completePhotoRoster,verifyChipEvidence}=require('../lib/accounting-vision.ts');
const op={kind:'add',date:'2026-10-22',game:16,printedGame:18,table:2,blind:'5M',player:'PARK SOO MIN',buyins:1,chips:100000};
const paper={date:op.date,table:2,printedGame:18,handwrittenGame:17,names:['PARK SOO MIN','LEE SUNG WON','KIM SEON HAK'],chipAmounts:[100000,100000,100000],selected:[true,true,true],hasSelectionMarkers:true};
const master=[['name','card','agency'],...paper.names.map(n=>[n,'','KOREA'])];
const result=completePhotoRoster([op],{documents:[paper]},master);
assert.equal(result.questions.length,0);assert.equal(result.operations.length,3);assert(result.operations.every(o=>o.game===17));
assert.equal(verifyChipEvidence(result.operations,{documents:[paper]}).operations.length,3);
for(const bad of [{...op,kind:'total'},{...op,gameConfirmed:true},{...op,printedGame:19},{...op,table:4}]){
 assert.equal(completePhotoRoster([bad],{documents:[paper]},master).operations.length,0);
}
assert.equal(completePhotoRoster([op],{documents:[paper,{...paper}]},master).operations.length,0);
console.log('Handwritten game correction and ambiguity guards passed');
