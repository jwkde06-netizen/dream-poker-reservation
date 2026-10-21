import { accessToken } from './accounting-google';
import { settingsDb } from './exchange-settings';
import type { ExchangePlan } from './exchange-domain';
import { exchangeSettlementPeriod, formatExchangeBalanceReceipt } from './exchange-receipt';

export const EXCHANGE_HEADERS = ['거래번호','베트남 일시','영업일','구분','받은 돈 · 지급한 돈','수수료 (VND)','실현환차익 (VND)','비용 (VND)','동 현금 증감','베트남 계좌 증감','원화 계좌 증감','달러 현금 증감','메모','원가 확인','담당자 ID','텔레그램 원문','취소 대상','외부 거래번호'];
export interface SheetEvent { sequence: number | string; reference: string; source_date: string; business_date: string; kind: string; plan: ExchangePlan; sender_id: string; update_id: number }
function workbook(): string {
  const id = process.env.EXCHANGE_GOOGLE_SPREADSHEET_ID || '';
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw Error('Exchange Google Sheet is not configured');
  return id;
}
async function sheets(path: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${workbook()}/${path}`, {
    method, headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('Exchange Google Sheet request failed');
  return response.json();
}
const normalized = (row: any[] = []) => Array.from({ length: 18 }, (_, i) => row[i] == null ? '' : row[i]);
const same = (a: any[], b: any[]) => JSON.stringify(normalized(a)) === JSON.stringify(normalized(b));
export async function verifyExchangeSheetConnection(): Promise<boolean> {
  const result = await sheets('values/' + encodeURIComponent("'환전장부'!A1:R1"));
  if (!same(result.values?.[0] || [], EXCHANGE_HEADERS)) throw Error('Exchange Google Sheet headers do not match');
  return true;
}
export function exchangeSheetRow(event: SheetEvent, sourceText: string): { row: number; values: (string | number)[] } {
  const sequence = Number(event.sequence), plan = event.plan;
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence >= 10000 || !/^FX-\d+-\d+$/.test(event.reference)) throw Error('Invalid exchange row identity');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.business_date)) throw Error('Invalid exchange date');
  const serial = Date.parse(event.business_date + 'T00:00:00Z') / 86400000 + 25569;
  if (!Number.isInteger(serial)) throw Error('Invalid exchange date');
  const deltas = ['VND_CASH','VND_BANK','KRW_BANK','USD_CASH'].map(account => plan.postings.filter(p => p.account === account).reduce((n, p) => n + p.amount_minor, 0) / (account === 'USD_CASH' ? 100 : 1));
  const labels: Record<string, string> = { opening: '기초 시제', exchange: '환전', movement: '시제 입출금', reversal: '취소' };
  if (!labels[event.kind]) throw Error('Invalid exchange kind');
  const at = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(event.source_date));
  const values = [event.reference, at, serial, labels[event.kind], plan.summary.join('\n'), plan.fee_vnd, plan.fx_profit_vnd ?? '', plan.expense_vnd, ...deltas, plan.note, plan.valuation_incomplete ? '미확인' : '확인', event.sender_id, sourceText, plan.reverses_reference || '', plan.external_reference || ''];
  if (values.some(v => typeof v === 'number' && !Number.isFinite(v))) throw Error('Invalid exchange money');
  return { row: sequence + 1, values };
}
/** Stable event sequence => stable sheet row. Retries never append another row. */
export async function syncExchangeEvent(event: SheetEvent, sourceText: string): Promise<void> {
  const { row, values } = exchangeSheetRow(event, sourceText), range = `'환전장부'!A${row}:R${row}`;
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  params.append('ranges', "'환전장부'!A1:R1"); params.append('ranges', range);
  const prior = await sheets('values:batchGet?' + params);
  if (!same(prior.valueRanges?.[0]?.values?.[0] || [], EXCHANGE_HEADERS)) throw Error('Exchange sheet headers changed');
  const existing = prior.valueRanges?.[1]?.values?.[0] || [];
  if (existing.some((x: unknown) => x != null && x !== '')) {
    if (!same(existing, values)) throw Error('Exchange sheet row changed; manual reconciliation required');
    return;
  }
  // RAW prevents customer names or messages beginning with = from becoming formulas.
  const written = await sheets('values/' + encodeURIComponent(range) + '?valueInputOption=RAW&includeValuesInResponse=true&responseValueRenderOption=UNFORMATTED_VALUE&responseDateTimeRenderOption=SERIAL_NUMBER', 'PUT', { range, majorDimension: 'ROWS', values: [values] });
  if (written.updatedRows !== 1 || !same(written.updatedData?.values?.[0] || [], values)) throw Error('Exchange sheet write was not verified');
}
/** Verify the sheet, then read all balances and weekly profit in one consistent report snapshot. */
export async function exchangeSheetReceipt(payload: Record<string, unknown>, config: { botId: string; chatId: string }): Promise<Record<string, unknown>> {
  const reply = payload.reply_parameters as { message_id?: number } | undefined;
  if (!reply?.message_id) return payload;
  const db = settingsDb();
  const result = await db.from('dream_exchange_events').select('sequence,reference,source_date,business_date,kind,plan,sender_id,update_id').eq('bot_id', config.botId).eq('chat_id', config.chatId).eq('message_id', reply.message_id).maybeSingle();
  if (result.error) throw Error('Exchange event lookup failed');
  if (!result.data) return payload;
  const source = await db.from('dream_exchange_jobs').select('raw_text').eq('bot_id', config.botId).eq('update_id', result.data.update_id).eq('chat_id', config.chatId).single();
  if (source.error || !source.data) throw Error('Exchange source lookup failed');
  await syncExchangeEvent(result.data as SheetEvent, source.data.raw_text);
  // Use current Vietnam date, not an old message date when delivering a delayed receipt.
  const period = exchangeSettlementPeriod();
  const snapshot = await db.rpc('dream_exchange_report', { p_chat_id: config.chatId, p_from: period.from, p_to: period.to });
  if (snapshot.error || !snapshot.data || snapshot.data.from !== period.from || snapshot.data.to !== period.to) throw Error('Exchange receipt report lookup failed');
  return { ...payload, text: formatExchangeBalanceReceipt(result.data.reference, result.data.plan, snapshot.data) };
}
