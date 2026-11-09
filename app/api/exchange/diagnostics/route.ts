import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/telegram';
import { withSavedExchange, setupTelegram, EXPECTED_EXCHANGE_USERNAME, EXCHANGE_PUBLIC_URL } from '../../../../lib/exchange-settings';
import { exchangeConfig } from '../../../../lib/exchange-telegram';
import { EXCHANGE_COMMANDS, EXCHANGE_MENU_VERSION, readCommandMenus, ensureCommandMenu, logMenuFailure } from '../../../../lib/exchange-menu';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
async function diagnostics(request: Request, refresh: boolean) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'Admin login required' }, { status: 403, headers });
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ error: 'Production only' }, { status: 403, headers });
  try {
    return await withSavedExchange(async row => {
      const config = exchangeConfig();
      const me = await setupTelegram(config.token, 'getMe');
      if (me?.is_bot !== true || me.username !== EXPECTED_EXCHANGE_USERNAME || String(me.id) !== config.botId) throw Error('Identity mismatch');
      if (refresh) {
        if (!row.enabled) return NextResponse.json({ error: 'Paused' }, { status: 409, headers });
        await ensureCommandMenu(true, config);
      }
      const webhook = await setupTelegram(config.token, 'getWebhookInfo');
      const expectedUrl = `${EXCHANGE_PUBLIC_URL}/api/exchange/webhook`;
      // An unexpected URL can contain secrets in any component. Report mismatch without echoing it.
      const actualUrl = webhook?.url === expectedUrl ? expectedUrl : webhook?.url ? '[unexpected URL redacted]' : '';
      const menus = await readCommandMenus(config);
      // Return only valid menu-shaped fields, never raw API payloads.
      const commands = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item?.command === 'string' && typeof item?.description === 'string').map(item => ({ command: item.command, description: item.description })) : [];
      return NextResponse.json({ version: EXCHANGE_MENU_VERSION,
        deploymentSha: /^[a-f0-9]{40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || '') ? process.env.VERCEL_GIT_COMMIT_SHA : null,
        bot: { id: config.botId, username: EXPECTED_EXCHANGE_USERNAME },
        webhook: { expectedUrl, actualUrl, matches: webhook?.url === expectedUrl },
        menu: { expected: EXCHANGE_COMMANDS, defaults: commands(menus.defaults), korean: commands(menus.korean), verified: menus.matches },
      }, { headers });
    });
  } catch (error) {
    logMenuFailure(error);
    return NextResponse.json({ error: 'Exchange verification failed' }, { status: 503, headers });
  }
}
/** Existing admin login only. No setup grants, webhook mutation or ledger writes. */
export async function GET(request: Request) { return diagnostics(request, false); }
export async function POST(request: Request) { return diagnostics(request, true); }
