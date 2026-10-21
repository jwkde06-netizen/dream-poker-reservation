import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient } from '@supabase/supabase-js';
import { projectUrl } from './telegram';

export type ExchangeSettings = {
  id: boolean; bot_id: string; username: string; encrypted_credentials: string;
  chat_id: string | null; chat_title: string | null; admin_ids: string[];
  activated_at: string; enabled: boolean; updated_at: string; webhook_verified: boolean; pair_hash: string | null; pair_expires_at: string | null;
};
export type ExchangeRuntime = { token: string; secret: string; username: string; chatId: string; adminIds: string[]; activatedAt: string; enabled: boolean };
export const exchangeRuntime = new AsyncLocalStorage<ExchangeRuntime>();
export const EXPECTED_EXCHANGE_USERNAME = 'dream_poker_exchange_bot';
export const EXCHANGE_PUBLIC_URL = 'https://dream-poker-reservation.vercel.app';
export const settingsDb = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Storage unavailable');
  return createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
};
function key(): Buffer {
  const value = process.env.EXCHANGE_SETTINGS_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw Error('Exchange encryption is not configured');
  return Buffer.from(value, 'hex');
}
export function sealCredentials(token: string, secret: string): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('dream-poker-exchange:v1'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ token, secret }), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}
export function openCredentials(value: string): { token: string; secret: string } {
  const [version, iv, tag, data, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data || extra) throw Error('Invalid encrypted configuration');
  const cipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  cipher.setAAD(Buffer.from('dream-poker-exchange:v1')); cipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const parsed = JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'base64url')), cipher.final()]).toString('utf8'));
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(parsed.token) || !/^[a-f0-9]{64}$/.test(parsed.secret)) throw Error('Invalid credentials');
  return parsed;
}
export const hashPairCode = (code: string) => createHash('sha256').update(code).digest('hex');
export async function loadExchangeSettings(): Promise<ExchangeSettings | null> {
  const { data, error } = await settingsDb().from('dream_exchange_connection').select('*').eq('id', true).maybeSingle();
  if (error) throw Error('Exchange configuration lookup failed');
  return data as ExchangeSettings | null;
}
export function runtimeFromSettings(row: ExchangeSettings): ExchangeRuntime {
  const { token, secret } = openCredentials(row.encrypted_credentials);
  if (token.split(':')[0] !== row.bot_id || row.username !== EXPECTED_EXCHANGE_USERNAME) throw Error('Exchange identity mismatch');
  return { token, secret, username: row.username, chatId: row.chat_id || '', adminIds: row.admin_ids, activatedAt: row.activated_at, enabled: row.enabled };
}
export async function withSavedExchange<T>(fn: (row: ExchangeSettings) => Promise<T>): Promise<T> {
  const row = await loadExchangeSettings();
  if (!row?.chat_id) throw Error('Exchange room is not connected');
  return exchangeRuntime.run(runtimeFromSettings(row), () => fn(row));
}
/** Telegram error payloads and credential-bearing URLs are never logged or returned. */
export async function setupTelegram(token: string, method: 'getMe' | 'getWebhookInfo' | 'setWebhook' | 'getChatMember' | 'sendMessage', payload: Record<string, unknown> = {}): Promise<any> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw Error('Telegram connection failed');
  return body.result;
}
export async function pairExchangeRoom(update: any, row: ExchangeSettings): Promise<boolean> {
  const m = update?.message;
  const match = typeof m?.text === 'string' ? m.text.trim().match(/^\/connect(?:@dream_poker_exchange_bot)?\s+([a-f0-9]{32})$/i) : null;
  if (!match) return false;
  if (!Number.isSafeInteger(m?.chat?.id) || m.chat.id >= 0 || !Number.isSafeInteger(m?.from?.id) || m.from.id <= 0 || !Number.isSafeInteger(m?.date) || m.date < Math.floor(Date.parse(row.activated_at) / 1000) || !['group', 'supergroup'].includes(m.chat.type) || m.from.is_bot || m.sender_chat || m.via_bot || m.forward_origin || m.forward_date || row.chat_id || !row.pair_hash || hashPairCode(match[1]) !== row.pair_hash || !row.pair_expires_at || Date.parse(row.pair_expires_at) <= Date.now()) return true;
  const { token } = openCredentials(row.encrypted_credentials);
  const member = await setupTelegram(token, 'getChatMember', { chat_id: m.chat.id, user_id: m.from.id });
  if (!['creator', 'administrator'].includes(member.status)) {
    await setupTelegram(token, 'sendMessage', { chat_id: m.chat.id, text: '환전방 연결 명령은 이 방의 관리자만 실행할 수 있습니다.' }); return true;
  }
  const bot = await setupTelegram(token, 'getChatMember', { chat_id: m.chat.id, user_id: Number(row.bot_id) });
  if (bot.status !== 'administrator') {
    await setupTelegram(token, 'sendMessage', { chat_id: m.chat.id, text: '일반 채팅 수신과 구성원 확인을 위해 Dream Poker Exchange를 이 환전방의 관리자로 추가한 뒤 연결 명령을 다시 보내주세요. 메시지 삭제·멤버 차단 권한은 필요하지 않습니다.' }); return true;
  }
  const { data, error } = await settingsDb().rpc('dream_exchange_bind_room', { p_hash: row.pair_hash, p_chat_id: String(m.chat.id), p_chat_title: String(m.chat.title || 'Exchange').slice(0, 200), p_admin_id: String(m.from.id) });
  if (error || !data) throw Error('Exchange room binding failed');
  await setupTelegram(token, 'sendMessage', { chat_id: m.chat.id, text: '✅ Dream Poker Exchange 연결 완료\n\n먼저 관리자가 실제 현재 잔액을 보내주세요:\n기초 시제 동 현금 …동, 베트남 계좌 …동, 원화 계좌 …원, 달러 현금 …USD\n\n없는 통화는 0으로 적고, 표시되는 미리보기를 확인한 뒤 시제 확정 명령을 보내주세요. 이후 완료된 환전 채팅이 자동 기록됩니다. /help로 사용법을 볼 수 있습니다.' });
  return true;
}
