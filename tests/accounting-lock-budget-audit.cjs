// Analysis only: no production budget policy is introduced by this test.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {completeAIJson}=require('../.test-build/accounting-ai-response');
const {reconsiderPaper}=require('../.test-build/accounting-decision');
(async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(fs.readFileSync('supabase/accounting_agent.sql','utf8'));
    const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
    const rpc=async(name,owner)=>(await db.query('select public.'+name+'($1) as ok',[owner])).rows[0].ok;
    assert.equal(await rpc('dream_accounting_acquire',a),true);
    await db.exec("update public.dream_accounting_mutex set acquired_at='2000-01-01'"); // synthetic DB only
    assert.equal(await rpc('dream_accounting_acquire',b),false);
    assert.equal(await rpc('dream_accounting_release',b),false);
    assert.equal(await rpc('dream_accounting_release',a),true);
    console.log('PASS A14 unchanged lock has no TTL takeover; release requires matching owner (in-memory SQL).');
  } finally {await db.close();}

  let clock=170000,attempts=0;
  await assert.rejects(()=>completeAIJson(async(attempt)=>{
    attempts++;clock+=attempt?35000:55000;
    throw Object.assign(new Error('simulated timeout'),{name:'TimeoutError'});
  },'extraction'));
  assert.equal(attempts,2);assert.equal(clock,260000);
  console.log('PASS A17 reproduction: existing retry helper can consume 90 seconds after 170 seconds elapsed.');

  clock=170000;attempts=0;
  // Proposed invariant only: absolute request deadline = existing 180-second ceiling.
  // A real implementation still needs an approved write/verification/reply reserve.
  await assert.rejects(()=>completeAIJson(async(attempt)=>{
    const remaining=180000-clock;
    if(remaining<=0)throw Error('Budget exhausted');
    attempts++;clock+=Math.min(attempt?35000:55000,remaining);
    throw Object.assign(new Error('simulated timeout'),{name:'TimeoutError'});
  },'extraction'),/Budget exhausted/);
  assert.equal(attempts,1);assert.equal(clock,180000);
  console.log('PASS A17 proposal simulation: remaining-time cap prevents a retry starting past 180 seconds.');

  let evidence=0,decisions=0;
  const result={documentType:'paper_game',question:'fixture?',operations:[]};
  await reconsiderPaper(result,{hasImage:true,confirmed:false,elapsed:()=>36000,
    readEvidence:async()=>{evidence++;return {}},decide:async()=>{decisions++;return result}});
  assert.equal(evidence,0);assert.equal(decisions,0);
  const times=[34000,56000];
  await reconsiderPaper(result,{hasImage:true,confirmed:false,elapsed:()=>times.shift(),
    readEvidence:async()=>{evidence++;return {}},decide:async()=>{decisions++;return result}});
  assert.equal(evidence,1);assert.equal(decisions,0);
  console.log('PASS A17 existing reconsideration 35/55-second gates retained; they are not a shared deadline.');
})().catch(e=>{console.error(e);process.exitCode=1});
