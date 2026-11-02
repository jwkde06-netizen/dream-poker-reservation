// Accounting's quality baseline is independent of other app features.
export const ACCOUNTING_DEFAULT_MODEL='gpt-6-astra';
export function accountingModel(image:boolean,env:Record<string,string|undefined>=process.env){
 const configured=(image?env.ACCOUNTING_VISION_MODEL:env.ACCOUNTING_TEXT_MODEL)||env.ACCOUNTING_MODEL||env.AI_GATEWAY_MODEL;
 const model=configured?.replace(/^openai\//,'');
 if(model?.includes('/'))throw Error('OPENAI_API:unsupported_model:400');
 return !model||['gpt-5-mini','gpt-5.4'].includes(model)?ACCOUNTING_DEFAULT_MODEL:model;
}

