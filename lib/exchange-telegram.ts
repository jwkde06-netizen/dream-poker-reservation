import { timingSafeEqual } from 'node:crypto';
import { exchangeRuntime } from './exchange-settings';
import { exchangeSheetReceipt } from './exchange-google';
export interface ExchangeConfig { token: string; botId: string; chatId: string; activatedAt: number; adminIds: Set<string> }
export function exchangeChatId(): string {
  const chatId = exchangeRuntime.getStore()?.chatId || process.env.EXCHANGE_TELEGRAM_CHAT_ID || '';
  if (!/^-[0-9]+$/.test(chatId)) throw Error('Exchange group is not configured');
  return chatId;
}
export function exchangeConfig(): ExchangeConfig {
  const runtime = exchangeRuntime.getStore();
  const token = runtime?.token || process.env.EXCHANGE_TELEGRAM_BOT_TOKEN || '';
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw Error('Exchange bot token is not configured');
  if ([process.env.TELEGRAM_BOT_TOKEN, process.env.RESERVATION_TELEGRAM_BOT_TOKEN, process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN].some(other => other && other.split(':')[0] === token.split(':')[0])) throw Error('Exchange requires its own bot token');
  const secret = runtime?.secret || process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET;
  if (secret && [process.env.TELEGRAM_WEBHOOK_SECRET, process.env.RESERVATION_TELEGRAM_WEBHOOK_SECRET, process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET].some(other => other && other === secret)) throw Error('Exchange requires its own webhook secret');
  const activated = runtime?.activatedAt || process.env.EXCHANGE_ACTIVATED_AT || '';
  const activatedAt = Date.parse(activated);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(activated) || !/(Z|[+-]\d{2}:\d{2})$/.test(activated) || !Number.isFinite(activatedAt)) throw Error('Exchange activation timestamp with timezone is required');
  const admins = runtime?.adminIds || (process.env.EXCHANGE_ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (admins.some(x => !/^\d+$/.test(x))) throw Error('Exchange administrator IDs are invalid');
  return { token, botId: token.split(':')[0], chatId: exchangeChatId(), activatedAt: Math.floor(activatedAt / 1000), adminIds: new Set(admins) };
}
export function exchangeAuthorized(request: Request, key = 'EXCHANGE_TELEGRAM_WEBHOOK_SECRET', header = 'x-telegram-bot-api-secret-token'): boolean {
  const expected = key === 'EXCHANGE_TELEGRAM_WEBHOOK_SECRET' ? (exchangeRuntime.getStore()?.secret || process.env[key]) : process.env[key];
  const got = request.headers.get(header)?.replace(/^Bearer\s+/i, '');
  if (!expected || !got) return false;
  const a = Buffer.from(expected), b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}
export class ExchangeTelegramFailure extends Error {
  constructor(public readonly deliveryUnknown: boolean) { super('Exchange Telegram request failed'); }
}
/** Only ledger receipts and membership reads. No payments, invitations or arbitrary URLs. */
export async function exchangeTelegram(method: 'sendMessage' | 'getChatMember', payload: Record<string, unknown>, config = exchangeConfig()): Promise<any> {
  if (method === 'sendMessage') {
    try { payload = await exchangeSheetReceipt(payload, config); }
    catch { throw new ExchangeTelegramFailure(false); }
  }
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ExchangeTelegramFailure(method === 'sendMessage'); }
  let result: any;
  try { result = await response.json(); } catch { throw new ExchangeTelegramFailure(method === 'sendMessage'); }
  if (!response.ok || !result.ok) throw new ExchangeTelegramFailure(false);
  return result.result;
}
