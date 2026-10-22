// Reconsider a paper-only clarification using independent evidence before asking staff.
export async function reconsiderPaper(result:any, options:{
 hasImage:boolean; confirmed:boolean; elapsed:()=>number;
 readEvidence:()=>Promise<any>; decide:(evidence:any,question:string)=>Promise<any>;
}){
 if(!options.hasImage||options.confirmed||result.documentType!=='paper_game'||
 !result.question||result.operations?.length||result.memory||options.elapsed()>35000)
 return {result,evidence:null,reviewed:false};
 const evidence=await options.readEvidence();
 // Keep time for validation, sheet writes and the Telegram reply.
 if(options.elapsed()>55000)return {result,evidence,reviewed:false};
 const candidate=await options.decide(evidence,result.question);
 // Never turn a review of a paper roster into rule changes or another document type.
 if(candidate.documentType!=='paper_game'||candidate.memory||
 !Array.isArray(candidate.operations)||candidate.operations.some((o:any)=>!['add','total','cancel','register'].includes(o.kind)))
 return {result,evidence,reviewed:true};
 return {result:candidate,evidence,reviewed:true};
}
