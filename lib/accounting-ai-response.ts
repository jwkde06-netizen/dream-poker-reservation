export class InvalidAIResponse extends Error {constructor(public reason:string){super('AI_RESPONSE_INVALID:'+reason);this.name='InvalidAIResponse';}}
export function parseAIResponse(d:any,kind:'extraction'|'columns'){
 const choice=d?.choices?.[0];
 if(choice?.finish_reason!=='stop')throw new InvalidAIResponse(String(choice?.finish_reason||'missing_completion'));
 if(typeof choice.message?.content!=='string')throw new InvalidAIResponse('missing_content');
 let value:any;try{value=JSON.parse(choice.message.content);}catch{throw new InvalidAIResponse('malformed_json');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InvalidAIResponse('invalid_object');
 if(kind==='extraction'&&(!Array.isArray(value.operations)||value.operations.length>100||value.operations.some((x:any)=>!x||typeof x!=='object'||Array.isArray(x))||(value.question!=null&&typeof value.question!=='string')))throw new InvalidAIResponse('invalid_operations');
 if(kind==='columns'&&(!Array.isArray(value.names)||!Array.isArray(value.chipAmounts)||!Array.isArray(value.selected)))throw new InvalidAIResponse('invalid_columns');
 return value;
}
export async function completeAIJson(request:(attempt:number)=>Promise<any>,kind:'extraction'|'columns'){
 let total=0,prompt=0,completion=0;
 for(let attempt=0;attempt<2;attempt++){
  const d=await request(attempt);
  total+=Number(d.usage?.total_tokens||0);prompt+=Number(d.usage?.prompt_tokens||0);completion+=Number(d.usage?.completion_tokens||0);
  try{return {...parseAIResponse(d,kind),_usage:{totalTokens:total,promptTokens:prompt,completionTokens:completion},_model:d.model,_attempts:attempt+1};}
  catch(e){if(!(e instanceof InvalidAIResponse)||attempt===1)throw e;}
 }
 throw new InvalidAIResponse('retry_exhausted');
}
export function canRetryPhoto(job:any){
 return !!job&&job.status==='failed'&&/^(AI_RESPONSE_INVALID:|Unterminated string in JSON|Unexpected end of JSON)/.test(job.failure_reason||'')&&!job.plan?.manual_handoff&&!job.plan?.resolvedBy&&!job.plan?.changes?.length&&!!(job.source_message?.photo||job.source_message?.document)&&(job.plan?.photoRetryCount||0)<3;
}
