import {createHash,randomUUID} from 'node:crypto';
import {db,ranges} from './accounting-agent';
import {tg} from './telegram';
import {parseCashierInput,reportChunks} from './cashier-input';
import {reviewCashierAgainstSheet} from './cashier-sheet-review';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const table='dream_cashier_reviews';
export async function createCashierReview(body:unknown,actor:string){
 const input=parseCashierInput(body);
 const [rows]=await ranges(["'일일 입력'!A:I"]);
 const review=reviewCashierAgainstSheet(input.statement,rows,input.evidence,input.options);
 const sourceHash=hash(rows),inputHash=hash(input);
 const insert=await db().from(table).insert({source_id:input.sourceId,input_hash:inputHash,created_by:actor,input,source_hash:sourceHash,review}).select('id').single();
 if(insert.error&&insert.error.code!=='23505')throw Error('대조 이력을 저장하지 못했습니다.');
 const found=insert.data|| (await db().from(table).select('id').eq('source_id',input.sourceId).eq('input_hash',inputHash).eq('source_hash',sourceHash).single()).data;
 if(!found)throw Error('대조 이력을 확인하지 못했습니다.');
 return {id:found.id,sourceHash,...review};
}
export async function publishCashierReview(id:string,expectedHash:string){
 const target=process.env.ACCOUNTING_REPORT_CHAT_ID;
 if(!target)throw Error('보고방이 설정되지 않았습니다.');
 const owner=randomUUID(),lock=await db().rpc('dream_accounting_acquire',{p_owner:owner});
 if(lock.error||!lock.data)throw Error('다른 정산 기록을 처리 중입니다. 잠시 후 다시 시도해주세요.');
 try{
  const saved=await db().from(table).select('*').eq('id',id).single();
  if(saved.error||!saved.data)throw Error('대조 이력을 찾지 못했습니다.');
  const busy=await db().from('dream_accounting_jobs').select('update_id').in('status',['received','processing','writing','uncertain']).limit(1);
  if(busy.error||busy.data?.length)throw Error('처리 중이거나 확인이 필요한 기록이 있어 보고를 보류했습니다.');
  const input=parseCashierInput(saved.data.input),[rows]=await ranges(["'일일 입력'!A:I"]);
  if(saved.data.source_hash!==expectedHash||hash(rows)!==expectedHash)throw Error('시트가 변경되었습니다. 최신 시트로 다시 대조해주세요.');
  const review=reviewCashierAgainstSheet(input.statement,rows,input.evidence,input.options);
  const key=review.readyToReport?target+':'+input.statement.date:target+':cashier:'+id;
  const text=input.statement.date+'\n'+review.text,chunks=reportChunks(text);
  // Persist a send intent before every network send; uncertain attempts are never replayed.
  for(let i=0;i<chunks.length;i++){
   const partKey=i===0?key:key+':part:'+i;
   const ins=await db().from('dream_desk_reports').insert({report_key:partKey,chat_id:target,report_date:input.statement.date,update_id:0,status:'sending',body:chunks[i],summary:{cashierReviewId:id,sourceHash:expectedHash,final:review.readyToReport,part:i+1,parts:chunks.length}});
   if(ins.error){
    if(ins.error.code!=='23505')throw Error('보고 이력을 저장하지 못했습니다.');
    const prior=await db().from('dream_desk_reports').select('status,summary').eq('report_key',partKey).single();
    if(prior.error||prior.data.status!=='sent')return {status:'uncertain',id,final:false};
    if(prior.data.summary?.cashierReviewId!==id)return {status:'already_reported',id,final:false};
    continue;
   }
   try{
    const sent=await tg('sendMessage',{chat_id:target,text:chunks[i]},15000);
    const receipt=await db().from('dream_desk_reports').update({status:'sent',message_id:sent.message_id}).eq('report_key',partKey);
    if(receipt.error)throw Error('Delivery receipt not saved');
   }catch{
    await db().from('dream_desk_reports').update({status:'uncertain'}).eq('report_key',partKey);
    return {status:'uncertain',id,final:false};
   }
  }
  return {status:'sent',id,final:review.readyToReport};
 }finally{await db().rpc('dream_accounting_release',{p_owner:owner});}
}
