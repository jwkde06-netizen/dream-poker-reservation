const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {reconsiderPaper}=require('../lib/accounting-decision.ts');
(async()=>{
 const initial={documentType:'paper_game',operations:[],question:'어느 게임인가요?'};
 const evidence={documents:[{date:'2026-10-22',table:5,printedGame:16,handwrittenGame:15}]};
 const answer={documentType:'paper_game',question:null,operations:[{kind:'cancel',game:15,player:'SEO JUN GI'},{kind:'add',game:15,player:'LEE KWANG TAE',buyins:1}]};
 let reads=0,decisions=0;
 const opts={hasImage:true,confirmed:false,elapsed:()=>1000,readEvidence:async()=>{reads++;return evidence},decide:async(e,q)=>{decisions++;assert.equal(e,evidence);assert.equal(q,initial.question);return answer}};
 assert.equal((await reconsiderPaper(initial,opts)).result,answer);
 for(const r of [{...initial,documentType:'phone_game'},{...initial,documentType:'fnb'},{...initial,operations:[{kind:'add'}]},{...initial,question:null},{...initial,memory:{action:'save'}}]){
  assert.equal((await reconsiderPaper(r,opts)).result,r);
 }
 assert.equal(reads,1);assert.equal(decisions,1);
 assert.equal((await reconsiderPaper(initial,{...opts,confirmed:true})).reviewed,false);
 assert.equal((await reconsiderPaper(initial,{...opts,elapsed:()=>36000})).reviewed,false);
 let ticks=0;
 assert.equal((await reconsiderPaper(initial,{...opts,elapsed:()=>++ticks===1?1000:56000})).reviewed,false);
 assert.equal((await reconsiderPaper(initial,{...opts,decide:async()=>({...answer,memory:{action:'save'}})})).result,initial);
 assert.equal((await reconsiderPaper(initial,{...opts,decide:async()=>({...answer,operations:[{kind:'fnb'}]})})).result,initial);
 await assert.rejects(reconsiderPaper(initial,{...opts,readEvidence:async()=>{throw Error('network failure')}}),/network failure/);
 console.log('Decision review: photo context, replacement, bounded review, no replay, no rule mutation passed');
})();
