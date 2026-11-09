import { COMMAND_ONLY_GUIDE, commandReference, explicitLedgerCommand, commandIntentKey } from './exchange-commands';
import { compactExchangeStatus, exchangeSettlementPeriod } from './exchange-receipt';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { projectUrl } from './telegram';
import {
  ACCOUNT_CODES, DEFAULT_EXCHANGE_RATES, EXCHANGE_ACCOUNTS, ExchangeEvent, ExchangeIntent,
  ExchangePlan, ExchangeReview, ExchangeState, formatMoney, isAmbiguousBareAmount,
  planExchange, reportDates, reverseExchange, safeMoney, toMinor, validateExchangeIntent, vietnamDate,
} from './exchange-domain';
import { ExchangeConfig, exchangeChatId, exchangeConfig, exchangeTelegram, ExchangeTelegramFailure } from './exchange-telegram';

export const exchangeDb = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Exchange storage is not configured');
  return createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};
interface Job {
  bot_id: string; update_id: number; chat_id: string; message_id: number; sender_id: string;
  source_date: string; raw_text: string; status: string; owner: string | null; intent: any;
  plan: ExchangePlan | null; reference: string | null; reply_text: string | null;
  reply_id: number | null; reply_state: string; context_update_id: number | null;
}

export const EXCHANGE_HELP = `DREAM EXCHANGE · 명령어 전용

일반 문장·사진은 기록하지 않습니다. 실제로 받은 돈과 지급한 돈을 명령어로 기록하며 은행 이체는 실행하지 않습니다. 원화는 계좌 하나로 통합합니다.

환전: /fx 받은금액 지급금액
예: /fx 315000원 550만동
예: /fx 100불 250만동
별도 수수료 포함: /fx 315000원 550만동 수수료 5만동
앞 금액은 받은 돈, 뒤 금액은 지급한 돈입니다. 통화·양쪽 금액은 필수입니다. 별도 수수료는 실제로 더 받은 동 금액만 적고 /fee로 중복 기록하지 마세요.

시제 입출금(관리자, 수익 제외)
/krwin 315000 · 원화 315,000원 추가
/krwout 100000 · 원화 100,000원 차감
/in 100불 · 달러 시제 보충
/out 10만동 · 동 시제 회수
원화만 증감하는 /krwin·/krwout는 동·달러를 바꾸지 않습니다. 숫자만 쓰면 원 단위이며 31.5만원·315,000원도 가능합니다.

수수료: /fee 5 = 5만동, /fee 100 = 100만동. /fee 50000 또는 /fee 5만동도 지원합니다. /fee5·/fee10 유지. /fee -31 = 손실 31만동.
명시한 수익: /profit 10만동
손실: /loss 10만동 · 비용: /expense 5만동
환전 원금은 수익에 포함하지 않습니다.

조회: /status · /today · /week · /lastweek
메뉴 다시 등록: /commands
비고: /memo 내용 = 추가 · /memo = 목록 · /memodel 번호 = 삭제

현재 잔액 설정(관리자): /vnd 1억 · /usd 1700 · /krw 315000. 더하는 명령이 아니라 현재 잔액을 해당 금액으로 맞춥니다. 0 가능, 수익 제외.
총 유통 시제 기준만 설정: /float 1억
센트비 기록: /sentbe = 원화 계좌 전액을 Google 환율로 동 시제로 환산해 기록. 실제 송금은 실행하지 않습니다.

취소(관리자): /cancel FX-봇번호-업데이트번호 사유
또는 완료 메시지에 답장으로 /cancel. 원거래는 지우지 않고 반대 전표를 남깁니다.

최초 설정(관리자): /opening 1억동 0원 100불. 세 통화와 0 잔액도 적고 미리보기 후 /confirm OPEN-번호로 확정합니다. 기존 기초 시제를 덮어쓰지 않습니다.

같은 거래를 중복 기록하지 마세요. 같은 내용은 5분 내 재입력을 막습니다. 별개 거래라면 끝에 고유 번호를 붙이세요. 예: /fx 100불 250만동 #receipt-123. 같은 번호는 다시 반영되지 않습니다. 수수료와 시제 입출금 명령도 #번호를 지원합니다.`;




/** Owner-declared reference capital; never a movement or reconciliation. */
export function exchangeFloatTarget(text:string):number|null {
 const t=text.trim();
 const match=t.match(/^(?:\/float(?:@\w+)?|총\s*유통\s*시[제재])\s*(?:[:：=]\s*)?([\d,]+(?:\.\d+)?)\s*(억|만|천)?\s*(?:동|VND)?\s*$/i);
 if(!match){
  if(/^(?:\/float(?:@\w+)?(?:\s|$)|총\s*유통\s*시[제재])/.test(t))throw new ExchangeReview('총 유통 시제는 /float 1억 또는 총 유통시제 1억처럼 입력해주세요. 단위는 동입니다.');
  return null;
 }
 if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(match[1]))throw new ExchangeReview('총 유통 시제 금액을 확인해주세요.');
 const [whole,fraction='']=match[1].replace(/,/g,'').split('.');
 if(fraction.length>8||whole.length>13)throw new ExchangeReview('총 유통 시제 금액을 확인해주세요.');
 const scale=BigInt('1'+'0'.repeat(fraction.length));
 const factor=BigInt(({억:100000000,만:10000,천:1000} as Record<string,number>)[match[2]||'']||1);
 const value=BigInt(whole+fraction)*factor;
 if(value%scale!==BigInt(0)||value/scale>BigInt(9000000000000))throw new ExchangeReview('총 유통 시제는 0~9조 동 사이의 정수로 입력해주세요.');
 return Number(value/scale);
}


/** Explicit VND current balance is a target, never fee income or an extra deposit. */
export function directVndBalance(text:string):number|null {
 const t=text.trim();
 const m=t.match(/^(?:(?:베트남(?:동)?|VND|동)\s*(?:현재\s*)?(?:시[제재]|잔액)|(?:현재\s*)?(?:시[제재]|잔액)\s*(?:베트남(?:동)?|VND|동))\s*[:：=]?\s*(.+)$/i);
 return m ? exchangeFloatTarget('/float '+m[1]) : null;
}


/** Absolute balance targets. Bare numeric input uses the named currency's units. */
export function slashExchangeBalance(text:string):{account:'VND_CASH'|'KRW_BANK'|'USD_CASH';target:number;label:string}|null {
 const m=text.trim().match(/^\/(vnd|usd|krw)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
 if(!m)return null;
 const code=m[1].toLowerCase(),value=(m[2]||'').trim();
 if(!value)throw new ExchangeReview(code==='vnd'?'/vnd 1억 또는 /vnd 100000000처럼 입력해주세요.':code==='usd'?'/usd 1700처럼 달러 잔액을 입력해주세요.':'/krw 315000처럼 원화 계좌 잔액을 입력해주세요.');
 if(code==='vnd')return {account:'VND_CASH',target:exchangeFloatTarget('/float '+value)!,label:'베트남동'};
 const amount=value.match(code==='usd'?/^(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:USD|달러|불)?$/i:/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(억|만|천)?\s*(?:KRW|원)?$/i);
 if(!amount)throw new ExchangeReview('잔액을 양수 또는 0으로 입력해주세요. 예: /'+code+(code==='usd'?' 1700':' 315000'));
 if(code==='usd')return {account:'USD_CASH',target:toMinor(amount[1].replace(/,/g,''),'USD_CASH',true),label:'달러'};
 const target=exchangeFloatTarget('/float '+amount[1]+(amount[2]||''))!;
 return {account:'KRW_BANK',target,label:'원화 계좌'};
}

/** Explicit KRW-only movements, not balance targets, exchanges, or revenue. */
export function slashKrwMovement(text:string, selectedAccount?:'KRW_BANK'|'KRW_CASH'):Extract<ExchangeIntent,{kind:'movement'}>|null {
 const command=text.trim().match(/^\/(krwin|krwout)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
 if(!command)return null;
 const name=command[1].toLowerCase(),input=(command[2]||'').trim();
 const usage=`/${name} 315000 또는 /${name} 31.5만원처럼 입력해주세요. 금액은 원 단위입니다.`;
 // Whole-string grammar rejects extra payments, fees, dates, signs and malformed grouping.
 const match=input.match(/^(?:(계좌|현금)\s+)?((?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?)\s*(억|만|천)?\s*(?:원|KRW)?(?:\s+(계좌|현금))?$/i);
 if(!match)throw new ExchangeReview(usage);
 if(match[1]&&match[4])throw new ExchangeReview(usage);
 const [whole,fraction='']=match[2].replace(/,/g,'').split('.');
 if(whole.length>13||fraction.length>8)throw new ExchangeReview(usage);
 const divisor=BigInt('1'+'0'.repeat(fraction.length));
 const factor=BigInt(({억:100000000,만:10000,천:1000} as Record<string,number>)[match[3]||'']||1);
 const scaled=BigInt(whole+fraction)*factor;
 if(scaled%divisor!==BigInt(0)||scaled<=BigInt(0)||scaled/divisor>BigInt(9000000000000))throw new ExchangeReview('원화 금액은 1원 이상 9조 원 이하의 정수로 입력해주세요.');
 // Legacy account words are accepted for compatibility; all new KRW uses one account.
 return {kind:'movement',account:'KRW_BANK',amount:String(scaled/divisor),direction:name==='krwin'?'in':'out',category:'capital',basis_vnd:null,
  note:`/${name} 원화 계좌 ${name==='krwin'?'입금':'출금'} · 원화만 증감 · 수익 제외`,external_reference:null};
}

/** Account answers resolve only the original pending command; never a new movement. */
export function pendingKrwMovement(sources:string[], selectedAccount?:'KRW_BANK'|'KRW_CASH'):Extract<ExchangeIntent,{kind:'movement'}>|null {
 const intents=sources.map(source=>slashKrwMovement(source,selectedAccount)).filter((x):x is Extract<ExchangeIntent,{kind:'movement'}>=>x!==null);
 if(!intents.length)return null;
 if(new Set(intents.map(x=>[x.account,x.amount,x.direction].join(':'))).size!==1)throw new ExchangeReview('서로 다른 원화 증감 요청이 있습니다. 처리할 원문에 답장해주세요.');
 return intents[0];
}

export function exchangeMemoCommand(text:string):{action:'add'|'list'|'delete';body:string|null;number:number|null}|null {
 const match=text.trim().match(/^\/(memo|memodel)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
 if(!match)return null;
 const value=(match[2]||'').trim();
 if(match[1].toLowerCase()==='memodel'){
  if(!/^[1-9]\d{0,8}$/.test(value))throw new ExchangeReview('/memodel 번호로 삭제해주세요. 예: /memodel 1');
  return {action:'delete',body:null,number:Number(value)};
 }
 if(!value)return {action:'list',body:null,number:null};
 if(value.length>200)throw new ExchangeReview('비고는 200자 이내로 적어주세요.');
 return {action:'add',body:value,number:null};
}

/** Fixed Google Finance KRW/VND quote; never fall back to a default rate. */
export function parseGoogleKrwVnd(html:string):string {
  // A pair identifier must tolerate Google's "KRW / VND" heading.
  const pair=/KRW\s*(?:\/|-|\\\/)\s*VND/i;
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const canonical=(html.match(/<meta\b[^>]*>/gi)||[]).find(tag=>/property=["']og:url["']/i.test(tag));
  const trustedPair=pair.test(title)||!!canonical&&/content=["']https:\/\/www\.google\.com\/finance\/(?:beta\/)?quote\/KRW-VND(?:[?"'])/i.test(canonical);
  const quote=(html.match(/<[^>]+>/g)||[]).find(tag=>/data-source=["']KRW["']/.test(tag)&&/data-target=["']VND["']/.test(tag));
  if(!trustedPair&&!quote)throw new ExchangeReview('Google 원화·동 환율을 확인하지 못했습니다. 시제는 변경하지 않았습니다.');
  const unit=quote?.match(/data-source-amount=["']([^"']+)["']/)?.[1];
  if(unit!==undefined&&Number(unit)!==1)throw new ExchangeReview('Google 환율의 원화 기준 단위를 확인하지 못했습니다. 시제는 변경하지 않았습니다.');
  // Legacy quotes carry data-last-price; Finance Beta renders nested spans.
  const legacy=html.match(/class=["'][^"']*\bYMlKec\b[^"']*\bfxKbKc\b[^"']*["'][^>]*>\s*([0-9,.]+)\s*</)?.[1];
  const modern=html.match(/<div\b[^>]*class=["'][^"']*\bN6SYTe\b[^"']*["'][^>]*>\s*<span\b[^>]*>\s*<span\b[^>]*>\s*([0-9,.]+)\s*<\/span>/)?.[1];
  const titleRate=title.match(/KRW\s*\/\s*VND\s+([0-9,.]+)\s*\(/)?.[1];
  const raw=quote?.match(/data-last-price=["']([0-9.]+)["']/)?.[1] || (trustedPair ? modern || legacy || titleRate : undefined);
  const rate=raw?.replace(/,/g,'');
  if(!rate||!/^\d+(?:\.\d{1,8})?$/.test(rate)||Number(rate)<1||Number(rate)>100)throw new ExchangeReview('Google 환율 조회에 실패했습니다. 시제는 변경하지 않았습니다. 잠시 후 /sentbe를 다시 보내주세요.');
  return rate;
}
export async function googleKrwVnd():Promise<{rate:string;checkedAt:string}> {
  try {
    const response=await fetch('https://www.google.com/finance/quote/KRW-VND?hl=en',{headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36','Accept':'text/html','Accept-Language':'en-US,en;q=0.9'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Quote unavailable');
    return {rate:parseGoogleKrwVnd(await response.text()),checkedAt:new Date().toISOString()};
  }catch(error){
    if(error instanceof ExchangeReview)throw error;
    throw new ExchangeReview('Google 환율을 조회하지 못해 시제를 변경하지 않았습니다. 잠시 후 /sentbe를 다시 보내주세요.');
  }
}
export function sentbeVndAmount(krw:number,rate:string):number {
  const [whole,fraction='']=rate.split('.');
  const denominator=BigInt('1'+'0'.repeat(fraction.length));
  const numerator=BigInt(krw)*BigInt(whole+fraction);
  return safeMoney(Number((numerator+denominator/BigInt(2))/denominator));
}

export async function getExchangeState(chatId = exchangeChatId()): Promise<ExchangeState> {
  const { data, error } = await exchangeDb().rpc('dream_exchange_state', { p_chat_id: chatId });
  if (error || !data || typeof data.initialized !== 'boolean' || !Number.isSafeInteger(data.version)) throw Error('Exchange state lookup failed');
  for (const code of ACCOUNT_CODES) {
    const a = data.accounts?.[code];
    if (!a || typeof a.balance_minor !== 'number' || (a.book_vnd !== null && typeof a.book_vnd !== 'number')) throw Error('Exchange balance is invalid');
    safeMoney(a.balance_minor); if (a.book_vnd !== null) safeMoney(a.book_vnd);
  }
  return data as ExchangeState;
}
export async function getExchangeReport(chatId: string, from: string, to: string): Promise<any> {
  const { data, error } = await exchangeDb().rpc('dream_exchange_report_with_carry', { p_chat_id: chatId, p_from: from, p_to: to });
  if (error || !data) throw Error('Exchange report lookup failed');
  return data;
}
export function formatExchangeReport(report:any):string {
  return report.initialized ? compactExchangeStatus(report) : '기초 시제가 아직 확정되지 않았습니다.';
}
export function formatExchangeReceipt(reference: string, plan: ExchangePlan): string {
  const lines = [`환전 원장 기록 완료 · ${reference}`, ...plan.summary];
  if (plan.kind !== 'opening') lines.push(
    `수수료 수입: ${formatMoney(plan.fee_vnd, 'VND_CASH')}`,
    plan.fx_profit_vnd === null ? '외화 처분 차익: 원가 미확인' : `외화 처분 차익: ${formatMoney(plan.fx_profit_vnd, 'VND_CASH')}`,
    ...(plan.expense_vnd ? [`비용: ${formatMoney(plan.expense_vnd, 'VND_CASH')}`] : []),
  );
  if (plan.kind !== 'opening') lines.push('', '반영 후 시제', ...plan.postings.map(p => `${EXCHANGE_ACCOUNTS[p.account].label}: ${formatMoney(p.after_minor, p.account)}`));
  if (plan.external_reference) lines.push(`외부 거래번호: ${plan.external_reference}`);
  return lines.join('\n').slice(0, 3900);
}

function exchangeNumberEvidence(source: string): Set<string> {
  const seen = new Set<string>();
  const pattern = /(?:\d[\d,]*)(?:\.\d+)?\s*(?:억|천만|백만|십만|만|천|[mMkK])?/g;
  for (const match of source.match(pattern) || []) {
    const p = match.replace(/,/g, '').trim().match(/^(\d+(?:\.\d+)?)\s*(억|천만|백만|십만|만|천|[mMkK])?$/);
    if (!p) continue;
    const factor: Record<string, number> = { 억: 100000000, 천만: 10000000, 백만: 1000000, 십만: 100000, 만: 10000, 천: 1000, m: 1000000, k: 1000 };
    const value = Number(p[1]) * (factor[(p[2] || '').toLowerCase()] || 1);
    if (Number.isFinite(value)) seen.add(String(value));
  }
  return seen;
}

/** Refuse model-created numbers. Payout arithmetic is done later by the domain layer. */
export function verifyExchangeNumberEvidence(intent: ExchangeIntent, source: string, sourceIntent: unknown = intent): void {
  const seen = exchangeNumberEvidence(source);
  const values: string[] = [];
  if (intent.kind === 'opening') {
    // Inspect the original extraction, before validation inserts the legacy default.
    // An explicitly supplied zero still requires numeric evidence.
    const raw = sourceIntent as { kind?: unknown; balances?: Record<string, unknown> } | null;
    const defaultedCash = raw?.kind === 'opening' && raw.balances != null &&
      raw.balances.KRW_CASH == null && intent.balances.KRW_CASH === '0';
    values.push(...ACCOUNT_CODES.filter(code => !(code === 'KRW_CASH' && defaultedCash)).map(code => intent.balances[code]),
      ...Object.values(intent.basis_vnd).filter((x): x is string => x != null));
  }
  if (intent.kind === 'exchange') values.push(intent.received.amount, ...(intent.paid.amount == null ? [] : [intent.paid.amount]), ...(intent.fee ? [intent.fee.amount] : []), ...(intent.rate_vnd ? [intent.rate_vnd] : []));
  if (intent.kind === 'movement') values.push(intent.amount, ...(intent.basis_vnd ? [intent.basis_vnd] : []));
  if (values.some(value => !seen.has(String(Number(value))))) throw new ExchangeReview('원문에서 금액을 확실히 확인하지 못했습니다. 실제 금액을 숫자로 다시 적어주세요. 환율 계산은 지급액을 추정해서 적지 않고 제가 계산합니다.');
}

/** A bare payout answer is evidence for paid.amount, never a new receipt or fee. */
function verifyPendingPayoutEvidence(intent: ExchangeIntent, answer: string, unresolved: string[]): void {
  if (intent.kind !== 'exchange' || intent.paid.amount == null ||
      !['VND_CASH', 'VND_BANK'].includes(intent.paid.account) ||
      !exchangeNumberEvidence(answer).has(String(Number(intent.paid.amount)))) {
    throw new ExchangeReview('미처리 환전의 실제 동 지급액인지 확인해주세요. 별도 수수료로 기록하지 않았습니다.');
  }
  // The received principal and rate must already exist in the pending source.
  verifyExchangeNumberEvidence({...intent, paid: {...intent.paid, amount: null}, fee: null}, unresolved.join('\n'));
  verifyPendingFeeEvidence(intent, unresolved);
}

function verifyPendingFeeEvidence(intent: Extract<ExchangeIntent, { kind: 'exchange' }>, sources: string[]): void {
  if (!intent.fee) return;

  // Accept only a separate, explicitly labelled fee clause from the pending transaction.
  // Full-clause matching rejects negation, hypotheticals and unrelated payout numbers.
  // Unrecognized phrasing stays in review; numeric coincidence is not provenance.
  const clauses = sources.flatMap(source => source.split(/[\n;。]|,(?!\d)/));
  let feeMentioned = false;
  for (const clause of clauses) {
    if (/수수료/.test(clause)) feeMentioned = true;
    // A later correction may omit the word "fee". Do not discard it while
    // collecting labelled amounts, or assume it refers to another transaction.
    else if (feeMentioned && /(?:아니|정정|수정|잘못|취소|없|안\s*(?:받|수령)|못\s*(?:받|수령)|받지\s*않|미수령|미입금)/.test(clause)) {
      throw new ExchangeReview('수수료 뒤에 부정·정정 내용이 있어 기록하지 않았습니다. 실제 받은 수수료를 다시 확인해주세요.');
    }
  }
  const feeClauses = clauses.filter(clause => /수수료/.test(clause));
  const matches = feeClauses.map(clause =>
    clause.trim().match(/^(?:이체\s*)?수수료\s*(?:[:：=]\s*)?(\d[\d,]*(?:\.\d+)?\s*(?:억|천만|백만|십만|만|천|[mMkK])?\s*(?:동|VND))\s*(?:(?:은|는)?\s*(?:(?:현금|계좌)로\s*)?(?:별도(?:로)?\s*)?(?:받음|받았음|받았어|수령(?:\s*완료)?))?$/i)
  );
  const fees = matches.flatMap(match => match ? Array.from(exchangeNumberEvidence(match[1])) : []);
  const feeAmount = String(Number(intent.fee.amount));
  if (matches.some(match => !match) || !fees.length || fees.some(amount => amount !== feeAmount)) {
    throw new ExchangeReview('지급액 답변을 수수료로도 기록할 수 없습니다. 실제 별도 수수료 금액을 명시해주세요.');
  }
}

async function patchJob(config: ExchangeConfig, id: number, patch: Record<string, unknown>, owner?: string): Promise<Job> {
  let query = exchangeDb().from('dream_exchange_jobs').update(patch).eq('bot_id', config.botId).eq('update_id', id).eq('chat_id', config.chatId);
  if (owner) query = query.eq('owner', owner).eq('status', 'processing');
  const { data, error } = await query.select('*').single();
  if (error || !data) throw Error('Exchange job persistence failed');
  return data as Job;
}
async function deliverReply(job: Job, config: ExchangeConfig): Promise<void> {
  if (job.status === 'applied' && !job.reply_text && job.plan && job.reference) job = await patchJob(config, job.update_id, { reply_text: formatExchangeReceipt(job.reference, job.plan) });
  if (!job.reply_text || job.reply_state !== 'unsent') return;
  const { data: claimed, error } = await exchangeDb().rpc('dream_exchange_claim_reply', { p_bot_id: config.botId, p_update_id: job.update_id });
  if (error) throw Error('Exchange reply claim failed');
  if (!claimed) return;
  try {
    const result = await exchangeTelegram('sendMessage', { chat_id: config.chatId, reply_parameters: { message_id: job.message_id, allow_sending_without_reply: true }, text: job.reply_text.slice(0, 3900) }, config);
    await patchJob(config, job.update_id, { reply_id: result.message_id, reply_state: 'sent' });
  } catch (error) {
    if (error instanceof ExchangeTelegramFailure) {
      // A network timeout after send is ambiguous. Do not send a duplicate receipt automatically.
      await patchJob(config, job.update_id, { reply_state: error.deliveryUnknown ? 'uncertain' : 'unsent' });
      if (error.deliveryUnknown) return;
    }
    throw error;
  }
}
async function finish(job: Job, config: ExchangeConfig, owner: string, status: 'review' | 'ignored' | 'failed', text: string, extra: Record<string, unknown> = {}) {
  const saved = await patchJob(config, job.update_id, { ...extra, status, reply_text: text.slice(0, 3900), lease_until: null }, owner);
  await deliverReply(saved, config);
}
async function authorizeActor(config: ExchangeConfig, sender: string, admin: boolean) {
  if (admin && !config.adminIds.has(sender)) throw new ExchangeReview(config.adminIds.size ? '기초 시제 확정·취소·시제 보충/회수는 등록된 관리자만 할 수 있습니다.' : '등록된 환전 관리자가 아직 없습니다. EXCHANGE_ADMIN_USER_IDS에 관리자 Telegram ID를 설정한 뒤 진행해주세요.');
  const member = await exchangeTelegram('getChatMember', { chat_id: config.chatId, user_id: Number(sender) }, config);
  if (!['creator', 'administrator', 'member'].includes(member.status) && !(member.status === 'restricted' && member.is_member === true)) throw new ExchangeReview('현재 환전방 구성원만 거래를 기록할 수 있습니다.');
}
async function previousContext(config: ExchangeConfig, messageId: number | undefined, senderId?: string, messageDate?: number): Promise<{ job: Job | null; unresolved_texts: string[] }> {
  let result, implicit = false;
  if (Number.isSafeInteger(messageId) && messageId && messageId > 0) {
    result = await exchangeDb().from('dream_exchange_jobs').select('*').eq('bot_id', config.botId).eq('chat_id', config.chatId).or(`message_id.eq.${messageId},reply_id.eq.${messageId}`).order('created_at', { ascending: false }).limit(1);
  } else if (senderId && Number.isSafeInteger(messageDate)) {
    implicit = true;
    const cutoff = new Date((messageDate! - 60 * 60) * 1000).toISOString();
    result = await exchangeDb().from('dream_exchange_jobs').select('*').eq('bot_id', config.botId).eq('chat_id', config.chatId).eq('sender_id', senderId).eq('status', 'review').gte('source_date', cutoff).lte('source_date', new Date(messageDate! * 1000).toISOString()).order('source_date', { ascending: false }).order('update_id', { ascending: false }).limit(20);
  } else return { job: null, unresolved_texts: [] };
  if (result.error) throw Error('Exchange context lookup failed');
  const rows = (result.data || []) as Job[];
  const previous = rows[0];
  if (!previous) return { job: null, unresolved_texts: [] };
  const texts: string[] = [], seen = new Set<number>(); let current: Job | undefined = previous;
  for (let count = 0; count < 8 && current?.status === 'review' && !seen.has(current.update_id); count++) {
    seen.add(current.update_id); texts.unshift(current.raw_text);
    if (current.context_update_id == null) break;
    const parent = await exchangeDb().from('dream_exchange_jobs').select('*').eq('bot_id', config.botId).eq('chat_id', config.chatId).eq('update_id', current.context_update_id).maybeSingle();
    if (parent.error) throw Error('Exchange pending context lookup failed');
    if (parent.data && parent.data.status !== 'review') throw new ExchangeReview('답장한 요청은 이미 다른 답장으로 해결되었습니다. 새 거래라면 내용을 새 메시지로 적어주세요.');
    current = parent.data as Job | undefined;
  }
  if(implicit&&rows.some(row=>!seen.has(row.update_id)))throw new ExchangeReview('미완료 요청이 여러 건입니다. 이어서 처리할 원문 질문에 답장해주세요.');
  return { job: previous, unresolved_texts: texts };
}
/** Deliberate short-hand convention authorized by the Exchange owner: +5만 = received transfer fee in VND. */
/** Owner-approved VND transfer-fee shorthand. Internal cash ledger is the unified VND float. */
export function exchangeFeeShortcut(text:string):ExchangeIntent|null {
  const t=text.trim().replace(/^\/fee@dream_poker_exchange_bot(?=\s|$)/i,'/fee').replace(/@dream_poker_exchange_bot$/i,'').trim();
  const preset=t.match(/^\/fee(5|10)$/i);
  if(preset) return {kind:'movement',account:'VND_CASH',amount:preset[1]==='5'?'50000':'100000',direction:'in',category:'fee',basis_vnd:null,note:'이체수수료',external_reference:null};
  const command=t.match(/^\/fee(?:@dream_poker_exchange_bot)?(?:\s+([\s\S]*))?$/i);
  if (!command && !t.startsWith('+')) return null;
  const loss=t.match(/^\/fee\s+[-−]([0-9][0-9,]*(?:\.[0-9]+)?)\s*(백만동|만동|천동|백만|만|천|동|vnd|m|k)?$/i);
  if(loss) {
    const factor:Record<string,number>={백만동:1000000,백만:1000000,m:1000000,만동:10000,만:10000,천동:1000,천:1000,k:1000,동:1,vnd:1};
    const n=Number(loss[1].replace(/,/g,''));
    // Legacy shorthand kept: "/fee -31" = 31만동 loss; larger bare numbers are VND.
    const unit=(loss[2]||(n<=1000?'만동':'동')).toLowerCase();
    return directFxLoss('환전손실 '+String(n*factor[unit])+'동');
  }
  let p=t, explicit=false;
  if(p.startsWith('+')){p=p.slice(1).trim();explicit=true;}
  else if(command){p=(command[1]||'').trim();explicit=true;}
  else if(p.startsWith('이체수수료 ')){p=p.slice(6).trim();explicit=true;}
  else if(p.startsWith('수수료 ')){p=p.slice(4).trim();explicit=true;}
  if(['오만','오만동','오만원'].includes(p))p='5만동';
  if(p.endsWith(' 수익완료'))p=p.slice(0,-5).trim();
  const m=p.match(/^([0-9][0-9,]*(?:[.][0-9]+)?)[ ]*(백만동|만동|천동|백만|만|천|m|k|동|vnd)?$/i);
  if(!m || (!explicit && !/^(?:[0-9][0-9,]*[ ]*(?:만동|만|천동|천|동))$/.test(p)))return null;
  const scale:Record<string,number>={'':1,동:1,vnd:1,만:10000,만동:10000,천:1000,천동:1000,백만:1000000,백만동:1000000,m:1000000,k:1000};
  const numeric=Number(m[1].replace(/,/g,''));
  // Legacy shorthand kept: "/fee 100" = 100만동; "/fee 50000" = 50,000동. Amount-only messages are still not fees.
  const tenThousandUnit=!!command&&!m[2]&&numeric<=1000;
  const amount=numeric*(tenThousandUnit?10000:scale[(m[2]||'').toLowerCase()]);
  if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw new ExchangeReview('수수료 금액을 확인해주세요.');
  return {kind:'movement',account:'VND_CASH',amount:String(amount),direction:'in',category:'fee',basis_vnd:null,note:'이체수수료',external_reference:null};
}

/** An explicitly stated current KRW balance is a reconciliation target, not a new exchange. */
export function directKrwBalance(text: string): string | null {
  if (/^\/sentbe(?:@dream_poker_exchange_bot)?$/i.test(text.trim())) return '0';
  const t = text.trim().replace(/,/g, '');
  if (/(?:원화|한화|krw)/i.test(t) && /(?:잔액|시제)/.test(t) &&
      /(?:보충|입금|출금|입출금|회수|송금|이체|지급|추가)/.test(t)) {
    throw new ExchangeReview('시제 보충·입출금 금액을 현재 잔액으로 조정하지 않았습니다. 실제 입출금인지, 현재 원화 계좌 잔액인지 구분해서 적어주세요.');
  }
  const match = t.match(/^(?:현재\s*)?(?:원화|한화|krw)\s*(?:(?:계좌|현금)\s*)?(?:잔액|시제)\s*(?:[:：=]\s*)?(\d+(?:\.\d+)?)\s*(만원|만\s*원|원|krw)?\s*$/i)
    || t.match(/^(?:현재\s*)?(?:잔액|시제)\s*(?:원화|한화|krw)\s*(?:(?:계좌|현금)\s*)?(?:[:：=]\s*)?(\d+(?:\.\d+)?)\s*(만원|만\s*원|원|krw)?\s*$/i);
  if (!match) return null;
  const amount = Number(match[1]) * (/^(?:만원|만\s*원)$/i.test(match[2] || '') ? 10_000 : 1);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 9_000_000_000_000) throw new ExchangeReview('원화 잔액 금액을 확인해주세요.');
  return String(amount);
}
/** Explicit negative income and loss statements never need AI clarification. */
export function directFxLoss(text:string):ExchangeIntent|null {
 const t=text.trim().replace(/\s+/g,'');
 const m=t.match(/^(?:환전)?(?:수익|차익|이익)[-−](\d[\d,]*(?:\.\d+)?)(백만동|만동|천동|동|vnd)$/i)
  ||t.match(/^(?:환전)?손실[-−]?(\d[\d,]*(?:\.\d+)?)(백만동|만동|천동|동|vnd)$/i)
  ||t.match(/^[-−]?(\d[\d,]*(?:\.\d+)?)(백만동|만동|천동|동|vnd)(?:환전)?손실$/i);
 if(!m)return null;
 const scale:Record<string,number>={백만동:1000000,만동:10000,천동:1000,동:1,vnd:1};
 const amount=Number(m[1].replace(/,/g,''))*scale[m[2].toLowerCase()];
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw new ExchangeReview('환전손실 금액을 확인해주세요.');
 return {kind:'movement',account:'VND_CASH',amount:String(amount),direction:'out',category:'fx_profit',basis_vnd:null,note:'사용자가 명시한 환전손실',external_reference:null};
}
/** A plainly labeled VND exchange profit is a confirmed receipt into the pooled VND float. */
export function directFxProfit(text:string):ExchangeIntent|null {
  const t=text.trim().replace(/\s+/g,' ');
  const m=t.match(/^환전\s*(?:수익|차익|이익)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(백만동|만동|천동|백만|만|천|동|vnd|m|k)$/i);
  if(!m)return null;
  const scale:Record<string,number>={백만:1000000,백만동:1000000,만:10000,만동:10000,천:1000,천동:1000,동:1,vnd:1,m:1000000,k:1000};
  const amount=Number(m[1].replace(/,/g,''))*scale[m[2].toLowerCase()];
  if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw new ExchangeReview('환전수익 금액을 확인해주세요.');
  return {kind:'movement',account:'VND_CASH',amount:String(amount),direction:'in',category:'fx_profit',basis_vnd:null,note:'사용자가 명시한 환전수익',external_reference:null};
}
/** Undo a fee transaction by exact receipt or an unambiguous amount. */
export function cancellationAmount(text: string): number | null {
  let t=text.trim();
  const command=t.match(/^\/cancel(?:@dream_poker_exchange_bot)?(?:\s+|$)/i);
  const slash=!!command;
  if (!slash && !/^[0-9][\s\S]*취소(?:해줘|해)?$/.test(t)) return null;
  if (command) t=t.slice(command[0].length).trim();
  for(const tail of ['취소해줘','취소해','취소']) if(t.endsWith(tail)) {t=t.slice(0,-tail.length).trim(); break;}
  const m=t.match(/^([0-9][0-9,]*(?:[.][0-9]+)?)[ ]*(백만동|만동|천동|백만|만|천|m|k|동|vnd)?$/i);
  if (!m) throw new ExchangeReview('취소할 금액을 알려주세요. 또는 완료 메시지에 답장으로 /cancel을 보내주세요.');
  const f:Record<string,number>={'':1,만:10000,만동:10000,천:1000,천동:1000,백만:1000000,백만동:1000000,m:1000000,k:1000,동:1,vnd:1};
  const v=Number(m[1].replace(/,/g,''))*f[(m[2]||'').toLowerCase()];
  if (!Number.isSafeInteger(v)||v<=0) throw new ExchangeReview('취소 금액을 확인해주세요.');
  return v;
}
async function cancellationIntent(config:ExchangeConfig, text:string, replyMessageId:number|undefined):Promise<ExchangeIntent|null> {
  const plain=text.trim().toLowerCase();
  const commandRef=text.trim().match(/^\/cancel(?:@\w+)?\s+(FX-\d+-\d+)\s+([\s\S]+)$/i);
  if(commandRef)return validateExchangeIntent({kind:'reversal',reference:commandRef[1].toUpperCase(),note:commandRef[2]});

  const referenced=text.trim().match(/^(FX-\d+-\d+)\s+취소(?:\s*[,，:：]\s*([\s\S]*)|\s+사유(?:\s+|[:：]\s*)([\s\S]*))?\s*$/i);
  if(referenced) {
    const note=(referenced[2]||referenced[3]||'').replace(/^사유\s*[:：]?\s*/, '').trim();
    return validateExchangeIntent({kind:'reversal',reference:referenced[1].toUpperCase(),note});
  }
  const bare=['취소','/cancel','/cancel@dream_poker_exchange_bot'].includes(plain);
  let amount=bare?null:cancellationAmount(text);
  if(!bare && amount===null)return null;
  const previous=await previousContext(config,replyMessageId);
  if(previous.job?.status==='applied' && previous.job.reference && previous.job.plan) {
    const p=previous.job.plan;
    if(p.kind==='opening'||p.kind==='reversal')throw new ExchangeReview('해당 거래는 이 방식으로 취소할 수 없습니다.');
    if(amount!==null && (p.kind!=='movement'||p.fee_vnd!==amount))throw new ExchangeReview('답장한 거래 금액과 취소 금액이 다릅니다.');
    return {kind:'reversal',reference:previous.job.reference,note:'관리자 요청으로 거래 취소'};
  }
  // Following the bot's own cancellation review must carry over the amount.
  if(amount===null && previous.job?.status==='review' && previous.job.raw_text) {
    try { amount=cancellationAmount(previous.job.raw_text); } catch {}
  }
  if(amount===null)throw new ExchangeReview('취소할 거래의 완료 메시지에 /cancel로 답장하거나 /cancel FX-번호 사유를 입력해주세요.');
  const result=await exchangeDb().from('dream_exchange_events').select('id,reference,fee_vnd,kind,reverses_id').eq('chat_id',config.chatId).order('sequence',{ascending:false}).limit(200);
  if(result.error)throw Error('Exchange cancellation lookup failed');
  const rows=result.data||[];
  const reversed=new Set(rows.filter(r=>r.kind==='reversal' && r.reverses_id).map(r=>String(r.reverses_id)));
  const active=rows.filter(r=>r.kind==='movement' && Number(r.fee_vnd)===amount && !reversed.has(String(r.id)));
  if(!active.length)throw new ExchangeReview('해당 금액의 미취소 거래가 없습니다. 이미 취소된 내역은 다시 차감하지 않았습니다.');
  if(active.length>1)throw new ExchangeReview('같은 금액의 미취소 거래가 여러 건입니다. 취소할 완료 메시지에 답장해주세요.');
  return {kind:'reversal',reference:active[0].reference,note:'관리자 요청으로 이체수수료 취소'};
}
/** KRW outgoing transfer and completed VND receipt; 원화 출금 defaults to the bank. */
export function directKrwPayout(text: string): ExchangeIntent | null {
 const t=text.replace(/,/g,'').replace(/\s+/g,'');
 const m=t.match(/^(\d+(?:\.\d+)?)(만|천)?원(?:계좌이체|이체|송금|출금|지급)(?:완료|함)?(\d+(?:\.\d+)?)(천만|백만|만|천)?동(?:받음|받았어|수령|받고)(?:완료)?$/);
 if(!m)return null;
 const scales:Record<string,number>={'':1,천:1000,만:10000,백만:1000000,천만:10000000};
 const krw=Number(m[1])*scales[m[2]||''],vnd=Number(m[3])*scales[m[4]||''];
 if(!Number.isSafeInteger(krw)||!Number.isSafeInteger(vnd)||krw<=0||vnd<=0)throw new ExchangeReview('환전 금액을 확인해주세요.');
 return {kind:'exchange',received:{account:'VND_CASH',amount:String(vnd)},paid:{account:'KRW_BANK',amount:String(krw)},fee:null,received_includes_fee:false,rate_vnd:null,note:'원화 계좌 지급 및 동 수령 완료',external_reference:null};
}
/** Exact completed KRW->VND sale, parsed before AI to protect compound Korean numerals. */
export function explicitKrwAccount(text:string):'KRW_BANK'|null {
  // Currency evidence is still required; account/mode words are no longer a distinction.
  return /(?:원화|한화|krw)|(?:\d[\d,.]*\s*(?:억|만|천)?\s*원)/i.test(text)?'KRW_BANK':null;
}

/** New input policy only. Historical plans, balances and reversals are never rewritten. */
export function unifiedKrwIntent(intent:ExchangeIntent):ExchangeIntent {
  const account=(code:typeof ACCOUNT_CODES[number])=>code==='KRW_CASH'?'KRW_BANK':code;
  if(intent.kind==='movement')return {...intent,account:account(intent.account)};
  if(intent.kind==='exchange'){
    if(account(intent.received.account)==='KRW_BANK'&&account(intent.paid.account)==='KRW_BANK')throw new ExchangeReview('원화는 한 계정으로 관리하므로 원화 내부 이동은 시제에 반영하지 않습니다.');
    return {...intent,received:{...intent.received,account:account(intent.received.account)},paid:{...intent.paid,account:account(intent.paid.account)}};
  }
  if(intent.kind==='opening'&&Number(intent.balances.KRW_CASH)!==0){
    if(Number(intent.balances.KRW_BANK)!==0)throw new ExchangeReview('원화는 하나로 관리합니다. 기초 시제의 원화 전체 잔액을 한 금액으로 알려주세요.');
    return {...intent,balances:{...intent.balances,KRW_BANK:intent.balances.KRW_CASH,KRW_CASH:'0'},
      basis_vnd:{...intent.basis_vnd,KRW_BANK:intent.basis_vnd.KRW_CASH,KRW_CASH:null}};
  }
  return intent;
}

/** Suppress only the retired KRW mode choice, never missing amounts or completion. */
export function isKrwModeQuestion(question:string,evidence:string):boolean {
  if(!explicitKrwAccount(evidence)||!/(?:현금|계좌)/.test(question))return false;
  if(/금액|얼마|몇|완료|예정|대기|아직|실제|취소|수수료|환율|언제|날짜/.test(question))return false;
  if(!/(?:원화|한화|KRW)/i.test(question)&&/(?:베트남|VND|달러|USD|\d\s*동)/i.test(question))return false;
  return /현금[\s\S]*계좌|계좌[\s\S]*현금|(?:현금|계좌)(?:으로|로)?\s*(?:수령|받|입금|지급|출금)|(?:수령|입금|지급|출금)[\s\S]*(?:현금|계좌)|(?:현금|계좌)[\s\S]*(?:인가요|맞|인지|여부)/.test(question);
}

export function directKrwExchange(text:string, selectedAccount?: 'KRW_CASH' | 'KRW_BANK'):ExchangeIntent|null {
 const compact=text.split(' ').join('');
 const m=compact.match(/^([0-9]+)만(?:(\d+)천|(\d{3,4}))원(?:원화)?(?:(?:현금|계좌)(?:으로|로)?)?받고([0-9]+)만동(드림|줌|지급|보냄)$/);
 if(!m)return null;
 const krw=Number(m[1])*10000+(m[2]?Number(m[2])*1000:Number(m[3])),vnd=Number(m[4])*10000;
 if(!Number.isSafeInteger(krw)||!Number.isSafeInteger(vnd)||krw<=0||vnd<=0)throw new ExchangeReview('환전 금액을 확인해주세요.');
 const mode='KRW_BANK' as const;
 return {kind:'exchange',received:{account:mode,amount:String(krw)},paid:{account:'VND_CASH',amount:String(vnd)},fee:null,received_includes_fee:false,rate_vnd:null,note:'원화 수령 및 동 지급 완료',external_reference:null};
}

/** Short staff answers belong to the latest unresolved request by that sender. */
export function isExchangeFollowup(text:string):boolean {
 return /^(?:네|예|응|맞아|맞습니다|확인|yes|y|환전|환전\s*대금|시[제재]\s*보충|환전\s*수익|환전\s*차익|차익|이익|수수료|(?:원화\s*)?(?:현금|계좌|계좌이체)|현금으로\s*받(?:음|았어))$/i.test(text.trim())
  ||/^[\d,]+(?:\.\d+)?\s*(?:천만|백만|만|천)?\s*동\s*(?:드림|지급|보냄|줌|나감)(?:\s*완료)?$/.test(text.trim());
}
/** Preserve an explicit bank receipt and ask ONLY for the missing VND payout. */
export function pendingKrwDepositExchange(sources:string[]):ExchangeIntent|null {
 const scale:Record<string,number>={'':1,천:1000,만:10000,백만:1000000,천만:10000000};
 const deposits=sources.map(s=>s.replace(/,/g,'').replace(/\s+/g,'').match(/^(?:원화|한화|krw)?(\d+(?:\.\d+)?)(만|천)?(?:원화|원|krw)(?:원화)?(?:계좌)?입금(?:완료|됨)?$/i)).filter((m):m is RegExpMatchArray=>m!==null);
 if(!deposits.length)return null;
 const krws=deposits.map(m=>Number(m[1])*scale[m[2]||'']);
 if(krws.some(n=>!Number.isSafeInteger(n)||n<=0||n>9000000000000))throw new ExchangeReview('입금된 원화 금액을 확인해주세요.');
 if(new Set(krws).size!==1)throw new ExchangeReview('서로 다른 원화 입금 금액이 있습니다. 처리할 원문에 답장해주세요.');
 const payouts=sources.map(s=>s.replace(/,/g,'').replace(/\s+/g,'').match(/^(\d+(?:\.\d+)?)(천만|백만|만|천)?동(?:드림|지급|보냄|줌|나감)(?:완료)?$/)).filter((m):m is RegExpMatchArray=>m!==null);
 const exchange=sources.some(s=>/^환전\s*(?:대금|완료)$/.test(s.trim()));
 if(!payouts.length){
  if(exchange)throw new ExchangeReview(`원화 ${krws[0].toLocaleString('en-US')}원 입금의 환전 건으로 확인했습니다. 지급한 동 금액만 알려주세요. 예: 550만동 드림`);
  return null;
 }
 const vnds=payouts.map(m=>Number(m[1])*scale[m[2]||'']);
 if(vnds.some(n=>!Number.isSafeInteger(n)||n<=0||n>9000000000000))throw new ExchangeReview('지급한 동 금액을 확인해주세요.');
 if(new Set(vnds).size!==1)throw new ExchangeReview('서로 다른 동 지급액이 있습니다. 처리할 원문에 답장해주세요.');
 return {kind:'exchange',received:{account:'KRW_BANK',amount:String(krws[0])},paid:{account:'VND_CASH',amount:String(vnds[0])},fee:null,received_includes_fee:false,rate_vnd:null,note:'원화 계좌 입금 및 동 지급 · 후속 답변 연결',external_reference:null};
}

/** Only persisted unresolved source messages can authorize a short confirmation. */
export function confirmedKrwExchange(sources: string[]): ExchangeIntent | null {
  const selected=explicitKrwAccount(sources.join('\n'))||undefined;
  const intents = sources.map(source=>directKrwExchange(source,selected)).filter((x): x is Extract<ExchangeIntent, { kind: 'exchange' }> => x?.kind === 'exchange');
  if (!intents.length) return null;
  const first = intents[0];
  if (intents.some(x => x.received.amount !== first.received.amount || x.paid.amount !== first.paid.amount)) {
    throw new ExchangeReview('답장 맥락에 서로 다른 환전 금액이 있습니다. 정확한 원문에 답장해주세요.');
  }
  return {...first, received: {...first.received, account: 'KRW_BANK'}};
}
export function directUsdExchange(text:string):ExchangeIntent|null {
 const x=text.toLowerCase().replace(/[,\s]/g,'').replace(/[·、]/g,'/');
 const usdPart='\\+?(\\d+(?:\\.\\d+)?)(?:usd|달러|불)',vndPart='(\\d+(?:\\.\\d+)?)(천만|백만|만|m)?(?:동|vnd)?';
 const got='(?:을|를)?(?:수령|받음|받았음|받았어|받았어요|받았습니다|받고|받아서|받아|입금)';
 const gave='(?:지급|지급함|나감|나갔음|나갔어|나갔어요|나갔습니다|줌|줬음|줬어|줬어요|줬습니다|드림|드렸음|드렸어요)';
 const sep='[/\\-−~→]?';
 // Both a USD receipt AND a VND payout must be stated; one half alone is never guessed.
 const legacy=x.match(new RegExp('^'+usdPart+'(?:수령|받음)?[-−]'+vndPart+'(?:나감|지급|줌|드림)?$'));
 const usdFirst=legacy||x.match(new RegExp('^'+usdPart+got+sep+vndPart+gave+'$'));
 const vndFirst=usdFirst?null:x.match(new RegExp('^'+vndPart+gave+sep+usdPart+got+'$'));
 const m=usdFirst||vndFirst;
 if(!m)return null;
 const [usdRaw,vndRaw,unit]=usdFirst?[m[1],m[2],m[3]]:[m[3],m[1],m[2]];
 const usd=Number(usdRaw), multiplier=({'천만':10000000,'백만':1000000,'만':10000,'m':1000000} as Record<string,number>)[unit||'']||1, vnd=Number(vndRaw)*multiplier;
 if(!Number.isFinite(usd)||usd<=0||!Number.isSafeInteger(Math.round(usd*100))||Math.abs(usd*100-Math.round(usd*100))>1e-9||!Number.isSafeInteger(vnd)||vnd<=0)throw new ExchangeReview('환전 금액을 확인해주세요.');
 return {kind:'exchange',received:{account:'USD_CASH',amount:String(usd)},paid:{account:'VND_CASH',amount:String(vnd)},fee:null,received_includes_fee:false,rate_vnd:null,note:'USD 수령 / VND 지급',external_reference:null};
}
function simpleIntent(text: string): ExchangeIntent | null {
  const t = text.trim().replace(/@\w+(?=\s|$)/, '');
  if (/^(\/start|\/help|도움말|사용법)$/i.test(t)) return { kind: 'help' };
  if (/^(\/balance|\/status|시제|잔액|시제\s*조회|잔액\s*조회|현황)$/i.test(t)) return { kind: 'balance' };
  if (/^(\/today|오늘\s*정산)$/i.test(t)) return { kind: 'report', period: 'today', from: null, to: null };
  const compact = t.replace(/\s+/g, '');
  if (/^\/week$/i.test(t) || /^(이번주(정산|수익)?|주간(정산|수익)?)$/i.test(compact)) return { kind: 'report', period: 'week', from: null, to: null };
  if (/^\/lastweek$/i.test(t) || /^지난주(정산|수익)?$/i.test(compact)) return { kind: 'report', period: 'last_week', from: null, to: null };
  return null;
}
function rpcReview(message: string): string | null {
  if (message.includes('exchange_stale')) return '다른 거래로 시제가 바뀌었습니다. 다시 계산해 처리해주세요.';
  if (message.includes('exchange_already_resolved')) return '이 요청은 이미 다른 답장으로 반영되었습니다. 중복 기록하지 않았습니다.';
  if (message.includes('exchange_already_reversed')) return '이미 취소되었거나 일반 취소 대상이 아닌 거래입니다.';
  if (message.includes('exchange_foreign_reversal_requires_reconciliation')) return '이 외화 거래 이후에 같은 외화의 거래가 있어 원가가 연결되어 있습니다. 관련 거래를 최신 순서로 확인한 뒤 취소해야 합니다. 원장은 변경하지 않았습니다.';
  if (message.includes('exchange_opening')) return '기초 시제 설정 상태를 확인해주세요. 아직 확정되지 않았거나 이미 다른 관리자가 확정했습니다.';
  if (message.includes('exchange_before_opening')) return '기초 시제 확정 이전의 거래는 자동 소급 반영하지 않습니다. 기존 내역을 대조한 뒤 관리자에게 확인해주세요.';
  if (message.includes('exchange_duplicate_external_reference')) return '같은 외부 거래번호가 이미 원장에 있습니다. 중복 기록하지 않았습니다. 시제/정산 내역에서 원거래를 확인해주세요.';
  if (message.includes('exchange_insufficient_balance')) return '기록 시점에 시제 잔액이 부족합니다. 누락된 보충·거래를 확인해주세요.';
  return null;
}

/** Webhook entry point. Chat, identity, activation time and immutable update identity are checked before extraction. */
export async function handleExchangeUpdate(update: any): Promise<void> {
  const config = exchangeConfig(), message = update?.message || update?.edited_message;
  if (!message || String(message.chat?.id) !== config.chatId || !['group', 'supergroup'].includes(message.chat?.type) || message.from?.is_bot || message.sender_chat || message.via_bot) return;
  if (!Number.isSafeInteger(update.update_id) || update.update_id < 0 || !Number.isSafeInteger(message.message_id) || message.message_id < 1 || !Number.isSafeInteger(message.from?.id) || message.from.id < 1 || !Number.isSafeInteger(message.date)) return;
  if (message.date < config.activatedAt) return;
  const text = typeof message.text === 'string' ? message.text.slice(0, 4096) : typeof message.caption === 'string' ? message.caption.slice(0, 4096) : '';
  if (!text && !message.photo && !message.document) return;
  const addressed = text.trim().match(/^\/\w+@(\w+)/), username = (process.env.EXCHANGE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').toLowerCase();
  if (addressed && addressed[1].toLowerCase() !== username) return;
  const owner = randomUUID();
  const claim = await exchangeDb().rpc('dream_exchange_claim', { p_bot_id: config.botId, p_update_id: update.update_id, p_chat_id: config.chatId, p_message_id: message.message_id, p_sender_id: String(message.from.id), p_source_date: new Date(message.date * 1000).toISOString(), p_text: text, p_owner: owner });
  if (claim.error || !claim.data) throw Error('Exchange job claim failed');
  if (claim.data.disposition === 'busy') throw Error('Exchange request is already processing');
  let job = claim.data.job as Job;
  if (claim.data.disposition === 'finished') { await deliverReply(job, config); return; }
  try {
    if (update.edited_message) { await finish(job, config, owner, 'review', '수정된 메시지는 원장에 재반영하지 않았습니다. 원거래 FX 번호로 취소한 뒤 올바른 거래를 새 메시지로 적어주세요.'); return; }
    if (message.forward_origin || message.forward_date || message.external_reply) { await finish(job, config, owner, 'review', '전달된 과거 내역은 자동 반영하지 않습니다. 실제 신규 거래의 받은 금액·지급 금액·수수료를 직접 적어주세요.'); return; }
    if (message.photo || message.document) { await finish(job, config, owner, 'review', '사진만으로 실제 수령·지급 여부를 확정하지 않습니다. 받은 통화·금액·계좌, 지급 통화·금액·계좌, 수수료를 글로 적어주세요.'); return; }
    if(!/^\/[a-z]/i.test(text.trim())){await finish(job,config,owner,'review',COMMAND_ONLY_GUIDE);return;}
    const floatTarget=exchangeFloatTarget(text);
    if(floatTarget!==null){
      await authorizeActor(config,job.sender_id,true);
      const result=await exchangeDb().rpc('dream_exchange_set_float',{p_bot_id:config.botId,p_update_id:job.update_id,p_owner:owner,p_amount:floatTarget});
      if(result.error||!result.data)throw Error('Exchange float setting persistence failed');
      await deliverReply(result.data as Job,config); return;
    }
    const memo=exchangeMemoCommand(text);
    if(memo){
      await authorizeActor(config,job.sender_id,memo.action==='delete');
      const result=await exchangeDb().rpc('dream_exchange_memo_command',{p_bot_id:config.botId,p_update_id:job.update_id,p_owner:owner,p_action:memo.action,p_body:memo.body,p_number:memo.number});
      if(result.error||!result.data)throw Error('Exchange memo persistence failed');
      await deliverReply(result.data as Job,config); return;
    }


    const slashBalance=slashExchangeBalance(text);
    const vndTarget=slashBalance?null:directVndBalance(text);
    const reconciliation=slashBalance||(vndTarget!==null?{account:'VND_CASH' as const,target:vndTarget,label:'베트남동'}:null);
    if(reconciliation){
      await authorizeActor(config,job.sender_id,true);
      const {account,target,label}=reconciliation;
      for(let attempt=0;attempt<3;attempt++){
        const currentState=await getExchangeState(config.chatId);
        if(!currentState.initialized)throw new ExchangeReview('현재 시제를 먼저 확정해주세요.');
        const current=safeMoney(currentState.accounts[account].balance_minor+(account==='VND_CASH'?currentState.accounts.VND_BANK.balance_minor:0));
        const delta=safeMoney(target-current);
        if(delta===0){await finish(job,config,owner,'ignored',label+' 시제가 이미 '+formatMoney(target,account)+'입니다.');return;}
        const amount=account==='USD_CASH'?(Math.abs(delta)/100).toFixed(2):String(Math.abs(delta));
        const adjustment:ExchangeIntent={kind:'movement',account,amount,direction:delta>0?'in':'out',category:'capital',basis_vnd:null,note:label+' 현재 잔액 대조 조정 ('+formatMoney(current,account)+' → '+formatMoney(target,account)+') · 수익 제외',external_reference:null};
        job=await patchJob(config,job.update_id,{intent:adjustment},owner);
        const plan=planExchange(adjustment,currentState);
        const result=await exchangeDb().rpc('dream_exchange_commit',{p_bot_id:config.botId,p_update_id:job.update_id,p_owner:owner,p_plan:plan,p_resolves_update_id:null});
        if(result.error?.message.includes('exchange_stale')&&attempt<2)continue;
        if(result.error||!result.data?.event)throw Error('Exchange balance reconciliation failed');
        const event=result.data.event;
        const saved=await patchJob(config,job.update_id,{reply_text:formatExchangeReceipt(event.reference,event.plan)});
        await deliverReply(saved,config);return;
      }
      throw new ExchangeReview('다른 거래가 처리 중입니다. 잠시 후 다시 보내주세요.');
    }
    const sentbe = /^\/sentbe(?:@dream_poker_exchange_bot)?$/i.test(text.trim());
    const today = vietnamDate(message.date);
    let intent: ExchangeIntent, resolves: number | null = null;
    let parsedCommand=false;
    let evidenceTexts=[text];

    const confirmation = text.trim().match(/^\/confirm(?:@\w+)?\s+OPEN-(\d+)\s*$/i);
    if (confirmation) {
      await authorizeActor(config, job.sender_id, true);
      const id = Number(confirmation[1]);
      if (!Number.isSafeInteger(id)) throw new ExchangeReview('시제 미리보기 번호를 확인해주세요.');
      const pending = await exchangeDb().from('dream_exchange_jobs').select('*').eq('bot_id', config.botId).eq('chat_id', config.chatId).eq('update_id', id).maybeSingle();
      if (pending.error) throw Error('Exchange opening lookup failed');
      if (!pending.data || pending.data.status !== 'review' || pending.data.intent?.kind !== 'opening') throw new ExchangeReview('확정할 기초 시제 미리보기를 찾지 못했거나 이미 처리되었습니다.');
      if (Date.parse(job.source_date) - Date.parse(pending.data.source_date) > 30 * 60 * 1000) throw new ExchangeReview('기초 시제 미리보기가 30분을 지났습니다. 현재 잔액을 다시 적어 새 미리보기를 확인해주세요.');
      intent = validateExchangeIntent(pending.data.intent);
      if(intent.kind==='opening'&&Number(intent.balances.KRW_CASH)!==0)throw new ExchangeReview('원화 통합 기준으로 기초 시제 미리보기를 다시 만들어 확인해주세요. 기존 미리보기는 반영하지 않았습니다.');
      resolves = id;
      evidenceTexts=[pending.data.raw_text||''];
      job = await patchJob(config, job.update_id, { intent, context_update_id: id }, owner);
    } else {
      const referenced=commandReference(text);
      const cancel = await cancellationIntent(config, referenced.text, message.reply_to_message?.message_id);
      const krwMovement=slashKrwMovement(referenced.text);
      const command=explicitLedgerCommand(text)||krwMovement||exchangeFeeShortcut(referenced.text);
      const readOnly=simpleIntent(referenced.text.replace(/@\w+(?=\s|$)/,''));
      const selected=cancel||command||readOnly||(sentbe?{kind:'balance'} as ExchangeIntent:null);
      if(!selected)throw new ExchangeReview(COMMAND_ONLY_GUIDE);
      intent=unifiedKrwIntent(selected);
      parsedCommand=!!command;
      if(krwMovement)evidenceTexts.push('원화 계좌');
      if(referenced.external_reference){
        if(!('external_reference' in intent))throw new ExchangeReview('이 명령에는 거래번호를 붙이지 않습니다.');
        intent={...intent,external_reference:referenced.external_reference};
      }
      job=await patchJob(config,job.update_id,{intent},owner);
    }
    if (intent.kind === 'ignore') { await finish(job, config, owner, 'ignored', ''); return; }
    if (intent.kind === 'help') { await finish(job, config, owner, 'ignored', EXCHANGE_HELP); return; }
    if (intent.kind === 'report') {
      const period = reportDates(intent, today), report = await getExchangeReport(config.chatId, period.from, period.to);
      await finish(job, config, owner, 'ignored', formatExchangeReport(report)); return;
    }
    const state = await getExchangeState(config.chatId);
    const balanceTarget = directKrwBalance(text);
    if (balanceTarget !== null) {
      if (!state.initialized) throw new ExchangeReview('현재 시제를 먼저 확정해주세요.');
      if(!sentbe&&explicitKrwAccount(text)!=='KRW_BANK')throw new ExchangeReview('현재 원화 잔액을 명시해주세요.');
      const current = state.accounts.KRW_BANK.balance_minor;
      const target = toMinor(balanceTarget, 'KRW_BANK', true);
      const delta = target - current;
      if (delta === 0) {
        await finish(job, config, owner, 'ignored', `원화 계좌 잔액이 이미 ${formatMoney(target, 'KRW_BANK')}입니다. 추가 조정은 기록하지 않았습니다.`); return;
      }
      intent = { kind: 'movement', account: 'KRW_BANK', amount: String(Math.abs(delta)), direction: delta > 0 ? 'in' : 'out', category: 'capital', basis_vnd: null, note: sentbe ? `센트비 이동 완료 · 원화 계좌 ${formatMoney(current, 'KRW_BANK')} → 0 KRW (수익 제외)` : `원화 계좌 잔액 대조 조정 (${formatMoney(current, 'KRW_BANK')} → ${formatMoney(target, 'KRW_BANK')})`, external_reference: null };
      job = await patchJob(config, job.update_id, { intent }, owner);
    }
    if (intent.kind === 'balance') {
      const period=exchangeSettlementPeriod(message.date); const report=await getExchangeReport(config.chatId,period.from,period.to); await finish(job,config,owner,'ignored',formatExchangeReport(report)); return;
    }
    const adminRequired = intent.kind === 'opening' || intent.kind === 'reversal' || (intent.kind === 'movement' && intent.category === 'capital');
    if(intent.kind==='opening'&&Number(intent.balances.KRW_BANK)!==0&&!explicitKrwAccount(evidenceTexts.join('\n'))){
      throw new ExchangeReview('기초 시제의 원화 전체 잔액을 알려주세요.');
    }
    if(intent.kind==='movement'&&intent.category==='fee'){
      const explicit=exchangeFeeShortcut(commandReference(text).text);
      if(!explicit||explicit.kind!=='movement'||explicit.amount!==intent.amount||intent.direction!=='in'||intent.account!=='VND_CASH'){
        throw new ExchangeReview('수수료는 +5만 또는 /fee 5만동으로 입력해주세요.');
      }
    }
    if(!sentbe&&(intent.kind==='exchange'||intent.kind==='movement')){
      const accounts=intent.kind==='exchange'?[intent.received.account,intent.paid.account]:[intent.account];
      for(const code of accounts.filter(code=>code==='KRW_CASH'||code==='KRW_BANK')){
        if(explicitKrwAccount(evidenceTexts.join('\n'))!=='KRW_BANK')throw new ExchangeReview('원화 거래인지와 실제 금액을 명시해주세요.');
      }
    }
    if (!confirmation) await authorizeActor(config, job.sender_id, adminRequired);
    if (intent.kind === 'opening' && !confirmation) {
      const preview = planExchange(intent, state);
      await finish(job, config, owner, 'review', ['기초 시제 미리보기 · 아직 반영 전', ...preview.summary, '', `맞으면 관리자가 아래 문장을 그대로 보내주세요.`, `/confirm OPEN-${job.update_id}`, '실제 현재 잔액으로만 시작합니다. 취득원가가 없는 외화의 차익은 미확정으로 남습니다.'].join('\n'), { intent, plan: preview }); return;
    }
    // Repeated fee commands sent before the first acknowledgement are delivery retries.
    if (intent.kind === 'movement' && intent.category === 'fee') {
      const prior = await exchangeDb().from('dream_exchange_jobs')
        .select('reference,reply_state,updated_at,source_date').eq('bot_id', config.botId)
        .eq('chat_id', config.chatId).eq('sender_id', job.sender_id)
        .eq('status', 'applied').eq('raw_text', text)
        .lt('source_date', job.source_date).order('source_date', { ascending: false }).limit(1);
      if (prior.error) throw Error('Exchange fee acknowledgement lookup failed');
      const original = prior.data?.[0];
      if (original && (original.reply_state !== 'sent' || Date.parse(original.updated_at) > Date.parse(job.source_date))) {
        await finish(job, config, owner, 'ignored', '이미 ' + original.reference + '로 기록된 요청입니다. 완료 답장 전에 다시 보낸 같은 명령은 중복 반영하지 않았습니다.');
        return;
      }
    }
    const verifyCommandRetry=async()=>{
    if(parsedCommand&&'external_reference' in intent&&!intent.external_reference){
      const cutoff=new Date(message.date*1000-5*60*1000).toISOString(),identity=commandIntentKey(intent);
      const recent=await exchangeDb().from('dream_exchange_jobs').select('reference,raw_text,intent').eq('bot_id',config.botId).eq('chat_id',config.chatId).eq('sender_id',job.sender_id).eq('status','applied').gte('source_date',cutoff).order('source_date',{ascending:false}).limit(100);
      if(recent.error)throw Error('Exchange command retry lookup failed');
      const duplicate=recent.data?.find((prior:any)=>{
        let previous:ExchangeIntent|null=prior.intent;
        if(!previous){try{previous=explicitLedgerCommand(prior.raw_text||'')||slashKrwMovement(prior.raw_text||'')||exchangeFeeShortcut(prior.raw_text||'');}catch{return false;}}
        return !!previous&&commandIntentKey(unifiedKrwIntent(previous))===identity;
      });
      if(duplicate)throw new ExchangeReview(`같은 내용이 방금 ${duplicate.reference}로 기록되었습니다. 중복 반영하지 않았습니다. 별개 거래라면 같은 명령 끝에 고유 #거래번호를 붙여주세요.`);
    }
    };
    let original: ExchangeEvent | null = null;
    if (intent.kind === 'reversal') {
      const result = await exchangeDb().from('dream_exchange_events').select('reference,plan,created_at').eq('chat_id', config.chatId).eq('reference', intent.reference).maybeSingle();
      if (result.error) throw Error('Exchange original lookup failed');
      if (!result.data) throw new ExchangeReview('이 방의 원장에서 해당 FX 거래번호를 찾지 못했습니다.');
      original = result.data as ExchangeEvent;
    }
    const sentbeQuote = sentbe ? await googleKrwVnd() : null;
    let latestState = state;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (sentbe && sentbeQuote) {
        const remaining = latestState.accounts.KRW_BANK.balance_minor;
        if (remaining === 0) {
          await finish(job, config, owner, 'ignored', '원화 계좌 시제가 이미 0원입니다. 추가 기록하지 않았습니다.'); return;
        }
        const vnd=sentbeVndAmount(remaining,sentbeQuote.rate);
        intent={kind:'exchange',received:{account:'VND_CASH',amount:String(vnd)},paid:{account:'KRW_BANK',amount:String(remaining)},fee:null,received_includes_fee:false,rate_vnd:null,note:`센트비 이동 · Google 환산 시제 반영 · 1원 = ${sentbeQuote.rate}동 · 조회 ${sentbeQuote.checkedAt} · 1동 단위 반올림 · 수익 제외`,external_reference:null};
        job=await patchJob(config,job.update_id,{intent},owner);
      }
      // Recheck after every optimistic-lock retry; a concurrent identical command may now exist.
      await verifyCommandRetry();
      const plan = intent.kind === 'reversal' ? reverseExchange(original!, latestState, intent.note) : planExchange(intent, latestState);
      const committed = await exchangeDb().rpc('dream_exchange_commit', { p_bot_id: config.botId, p_update_id: job.update_id, p_owner: owner, p_plan: plan, p_resolves_update_id: resolves });
      if (committed.error?.message.includes('exchange_stale') && attempt < 2) { latestState = await getExchangeState(config.chatId); continue; }
      if (committed.error) { const review = rpcReview(committed.error.message); if (review) throw new ExchangeReview(review); throw Error('Exchange commit outcome requires reconciliation'); }
      if (!committed.data?.ok || !committed.data.event) throw Error('Exchange commit outcome requires reconciliation');
      const event = committed.data.event;
      const applied = await patchJob(config, job.update_id, { reply_text: formatExchangeReceipt(event.reference, event.plan) });
      await deliverReply(applied, config); return;
    }
    throw new ExchangeReview('다른 거래가 연속 처리 중입니다. 잠시 후 같은 내용을 다시 요청해주세요.');
  } catch (error) {
    const saved = await exchangeDb().from('dream_exchange_jobs').select('*').eq('bot_id', config.botId).eq('chat_id', config.chatId).eq('update_id', job.update_id).single();
    if (saved.error) throw Error('Exchange outcome lookup failed');
    const current = saved.data as Job;
    // If an RPC response was lost after commit, recover from the durable job instead of booking again.
    if (current.status === 'applied') { await deliverReply(current, config); return; }
    if (current.status !== 'processing' || current.owner !== owner) { if (['review', 'ignored', 'failed', 'resolved'].includes(current.status)) { await deliverReply(current, config); return; } throw error; }
    if (error instanceof ExchangeReview) { await finish(current, config, owner, 'review', error.message); return; }
    if (current.intent?.kind === 'report' || current.intent?.kind === 'balance') {
      await finish(current, config, owner, 'failed', '정산 조회 중 오류가 발생했습니다. 이번 요청은 조회만 실행되어 거래 원장에는 반영되지 않았습니다. 잠시 후 /week 또는 /status로 다시 조회해주세요.', { failure_reason: 'Exchange report lookup failed; no ledger write was attempted' }); return;
    }
    await finish(current, config, owner, 'failed', '처리 결과를 확인해야 합니다. 이 요청을 자동으로 다시 기록하지 않습니다. 시제·정산 내역을 조회한 뒤 관리자에게 확인해주세요.', { failure_reason: 'Processing or delivery failed; inspect this job before replay' });
  }
}
