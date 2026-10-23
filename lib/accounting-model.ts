// Accounting's quality baseline is independent of other app features.
export const ACCOUNTING_DEFAULT_MODEL='openai/gpt-6-astra';
export function accountingModel(image:boolean,env:Record<string,string|undefined>=process.env){
 const configured=(image?env.ACCOUNTING_VISION_MODEL:env.ACCOUNTING_TEXT_MODEL)||env.ACCOUNTING_MODEL||env.AI_GATEWAY_MODEL;
 return !configured||['openai/gpt-5-mini','openai/gpt-5.4'].includes(configured)?ACCOUNTING_DEFAULT_MODEL:configured;
}
