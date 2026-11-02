// Accounting calls OpenAI directly. Bare OpenAI model ids only; the Vercel AI Gateway setting is ignored here.
export const ACCOUNTING_DEFAULT_MODEL='gpt-6.1-sol';
const RETIRED=['gpt-5-mini','gpt-5.4'];
export function accountingModel(image:boolean,env:Record<string,string|undefined>=process.env){
 const raw=((image?env.ACCOUNTING_VISION_MODEL:env.ACCOUNTING_TEXT_MODEL)||env.ACCOUNTING_MODEL||'').trim().replace(/^openai\//,'');
 return !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(raw)||RETIRED.includes(raw)?ACCOUNTING_DEFAULT_MODEL:raw;
}
export const OPENAI_CHAT_URL='https://api.openai.com/v1/chat/completions';
