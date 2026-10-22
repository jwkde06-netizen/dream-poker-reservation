const assert=require('node:assert/strict'),Module=require('node:module');
const {createHash}=require('node:crypto');
const row=[7,46317,'13-2','5M','LEE KWANG TAE','','KOREA',1,500000];
let rows=[[],row],sent=[],reports=new Map(),busy=false,fail=false,released=0;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourceHash=hash(rows);
const input={sourceId:'fixture',statement:{date:'2026-10-22',currency:'VND',complete:true,totalBuyins:1,totalAmount:500000,entries:[{game:7,player:'LEE KWANG TAE',buyins:1,amount:500000}]},evidence:{allPagesVerified:true,codeScopeVerified:true,amountBasisVerified:true},options:{requireGameMapping:false}};
let saved={id:'review-1',source_hash:sourceHash,input};
function query(table){let filters={},mode='select',value;const q={select(){return q},eq(k,v){filters[k]=v;return q},limit(){return q},in(){return q},single(){return q},insert(v){mode='insert';value=v;return q},update(v){mode='update';value=v;return q},then(resolve,reject){try{let result;if(table==='dream_cashier_reviews')result={data:saved};else if(table==='dream_accounting_jobs')result={data:busy?[{}]:[]};else if(mode==='insert'){if(reports.has(value.report_key))result={error:{code:'23505'}};else{reports.set(value.report_key,value);result={error:null}}}else if(mode==='update'){Object.assign(reports.get(filters.report_key),value);result={error:null}}else result={data:reports.get(filters.report_key)};return Promise.resolve(result).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q;}
const original=Module._load;
Module._load=function(request,parent,isMain){if(request==='./accounting-agent')return {db:()=>({from:query,rpc:async(name)=>{if(name.includes('release'))released++;return {data:true}}}),ranges:async()=>[rows]};if(request==='./telegram')return {tg:async(_,payload)=>{if(fail)throw Error('timeout');sent.push(payload);return {message_id:sent.length}}};return original.apply(this,arguments)};
const {publishCashierReview}=require('../.test-build/cashier-service');
Module._load=original;
process.env.ACCOUNTING_REPORT_CHAT_ID='-5378671785';
(async()=>{
 assert.equal((await publishCashierReview('review-1',sourceHash)).status,'sent');assert.equal(sent.length,1);assert.match(sent[0].text,/금일 총 1게임 1바이인 500,000동입니다/);
 await publishCashierReview('review-1',sourceHash);assert.equal(sent.length,1);
 rows=[[],[...row.slice(0,7),2,1000000]];await assert.rejects(publishCashierReview('review-1',sourceHash),/변경/);assert.equal(sent.length,1);rows=[[],row];
 busy=true;await assert.rejects(publishCashierReview('review-1',sourceHash),/보류/);busy=false;
 reports.clear();fail=true;assert.equal((await publishCashierReview('review-1',sourceHash)).status,'uncertain');fail=false;assert.equal((await publishCashierReview('review-1',sourceHash)).status,'uncertain');assert.equal(sent.length,1);
 reports.clear();saved={...saved,input:{...input,evidence:{}}};const result=await publishCashierReview('review-1',sourceHash);assert.equal(result.final,false);assert.match(sent[1].text,/금액 기준 확인/);
 assert.equal(released,7);
 console.log('cashier delivery: duplicate, stale snapshot, busy, uncertain send, evidence gates and lock release passed');
})().catch(e=>{console.error(e);process.exitCode=1});
