import { createHash, timingSafeEqual } from 'node:crypto';
import { requireAdmin } from './telegram';
import { loadExchangeSettings } from './exchange-settings';

/** Owner-issued short-lived grant. ONLY initial Exchange setup; never ledger/admin access. */
export function validExchangeSetupKey(value: string | null): boolean {
  const hash = process.env.EXCHANGE_SETUP_KEY_HASH || '', expires = Date.parse(process.env.EXCHANGE_SETUP_EXPIRES_AT || '');
  if (process.env.VERCEL_ENV !== 'production' || !value || !/^[a-f0-9]{64}$/.test(value) || !/^[a-f0-9]{64}$/.test(hash) || !Number.isFinite(expires) || Date.now() >= expires) return false;
  return timingSafeEqual(createHash('sha256').update(value).digest(), Buffer.from(hash, 'hex'));
}
export async function requireExchangeSetup(request: Request): Promise<boolean> {
  if (request.headers.has('x-exchange-setup-key')) {
    if (!validExchangeSetupKey(request.headers.get('x-exchange-setup-key'))) return false;
    try { return !(await loadExchangeSettings())?.chat_id; } catch { return false; }
  }
  return !!await requireAdmin(request);
}
