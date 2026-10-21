import {timingSafeEqual} from 'node:crypto';

type Environment = Record<string, string | undefined>;
export type AccountingIdentity = {
  mode: 'legacy' | 'dedicated';
  botId: string;
  chatId: string;
  expectedUsername: string | null;
  jobsTable: 'dream_accounting_jobs' | 'dream_accounting_jobs_v2';
  rulesTable: 'dream_accounting_rules' | 'dream_accounting_rules_v2';
  activatedAt: number | null;
};

// Staging a token never changes the live accounting bot. Cutover is explicit.
function configuration(env: Environment = process.env) {
  const mode = env.ACCOUNTING_BOT_MODE || 'legacy';
  if (mode !== 'legacy' && mode !== 'dedicated') throw Error('Invalid ACCOUNTING_BOT_MODE');
  const dedicated = mode === 'dedicated';
  const token = (dedicated ? env.ACCOUNTING_TELEGRAM_BOT_TOKEN : env.TELEGRAM_BOT_TOKEN) || '';
  const secret = (dedicated ? env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET : env.TELEGRAM_WEBHOOK_SECRET) || '';
  const chatId = (dedicated ? env.ACCOUNTING_TELEGRAM_CHAT_ID : env.STAFF_TELEGRAM_CHAT_ID) || '';
  const match = /^(\d+):[A-Za-z0-9_-]+$/.exec(token);
  if (!match || !/^-\d{5,22}$/.test(chatId)) throw Error('Accounting bot or group is not configured');
  if (dedicated && [env.TELEGRAM_BOT_TOKEN,env.RESERVATION_TELEGRAM_BOT_TOKEN,env.EXCHANGE_TELEGRAM_BOT_TOKEN].some(other=>other?.split(':')[0]===match[1])) throw Error('Accounting requires its own bot identity');
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) throw Error('Accounting webhook secret is not configured');
  if (dedicated && [env.TELEGRAM_WEBHOOK_SECRET,env.RESERVATION_TELEGRAM_WEBHOOK_SECRET,env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET].includes(secret)) throw Error('Accounting requires its own webhook secret');
  const activation=env.ACCOUNTING_ACTIVATED_AT||'';
  const activatedAt=dedicated?Date.parse(activation):null;
  if(dedicated&&(!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(activation)||!Number.isFinite(activatedAt)))throw Error('Accounting activation timestamp is not configured');
  return {
    token, secret,
    identity: {
      mode, botId: match[1], chatId,
      expectedUsername: dedicated ? (env.ACCOUNTING_TELEGRAM_BOT_USERNAME || null) : 'dream_poker_reservation_bot',
      jobsTable: dedicated ? 'dream_accounting_jobs_v2' : 'dream_accounting_jobs',
      rulesTable: dedicated ? 'dream_accounting_rules_v2' : 'dream_accounting_rules',
      activatedAt:activatedAt===null?null:Math.floor(activatedAt/1000)
    } as AccountingIdentity
  };
}

export function accountingIdentity(env: Environment = process.env): AccountingIdentity {
  return configuration(env).identity;
}

export function accountingWebhookAuthorized(request: Request, env: Environment = process.env) {
  let expected: string;
  try { expected = configuration(env).secret; } catch { return false; }
  const supplied = request.headers.get('x-telegram-bot-api-secret-token') || '';
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function accountingWebhookSecret() { return configuration().secret; }

export async function accountingTg(method: string, payload: Record<string, unknown> = {}) {
  if (!/^[A-Za-z]+$/.test(method)) throw Error('Invalid Telegram method');
  const {token} = configuration();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload),
    cache: 'no-store', signal: AbortSignal.timeout(20000)
  });
  const body = await response.json();
  // Do not return third-party response descriptions or credential-bearing URLs.
  if (!response.ok || !body.ok) throw Error(`Accounting Telegram ${method} failed (${response.status})`);
  return body.result;
}

export async function accountingImage(fileId: string): Promise<Buffer> {
  if (!fileId || fileId.length > 1024) throw Error('Invalid Telegram image');
  const file = await accountingTg('getFile', {file_id: fileId});
  if (typeof file.file_path !== 'string' || !/^[\w/.-]+$/.test(file.file_path) || file.file_path.includes('..')) throw Error('Invalid Telegram image path');
  if (Number(file.file_size) > 10000000) throw Error('Image exceeds size limit');
  const {token} = configuration();
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {signal: AbortSignal.timeout(15000)});
  if (!response.ok || Number(response.headers.get('content-length')) > 10000000) throw Error('Image download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 10000000) throw Error('Image exceeds size limit');
  return bytes;
}

export function accountingEventKey(identity: AccountingIdentity, updateId: number) {
  if (!Number.isSafeInteger(updateId) || updateId < 0) throw Error('Invalid Telegram update ID');
  return identity.mode === 'legacy' ? String(updateId) : `${identity.botId}:${updateId}`;
}

export function accountingMessageAllowed(identity:AccountingIdentity,message:any) {
  if(!message||String(message.chat?.id)!==identity.chatId||!['group','supergroup'].includes(message.chat?.type))return false;
  if(!Number.isSafeInteger(message.from?.id)||message.from.id<=0||message.from.is_bot||message.sender_chat)return false;
  if(identity.activatedAt!==null&&(!Number.isSafeInteger(message.date)||message.date<identity.activatedAt))return false;
  return true;
}

export async function sendAccountingDraft(messageId:number,filename:string,content:string,caption:string) {
  if (!Number.isSafeInteger(messageId)||!/^dream-accounting-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/.test(filename)) throw Error('Invalid accounting draft');
  const {token,identity}=configuration();
  const form=new FormData();
  form.set('chat_id',identity.chatId);
  form.set('reply_parameters',JSON.stringify({message_id:messageId,allow_sending_without_reply:true}));
  form.set('caption',caption.slice(0,1000));
  form.set('document',new Blob([content],{type:'text/csv;charset=utf-8'}),filename);
  const response=await fetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:form,signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if(!response.ok||!body.ok)throw Error('Accounting draft delivery failed');
  return body.result;
}
