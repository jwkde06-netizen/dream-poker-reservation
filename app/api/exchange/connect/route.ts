import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireExchangeSetup } from '../../../../lib/exchange-onboarding';
import { verifyExchangeSheetConnection } from '../../../../lib/exchange-google';
import { settingsDb, loadExchangeSettings, sealCredentials, hashPairCode, setupTelegram, EXPECTED_EXCHANGE_USERNAME, EXCHANGE_PUBLIC_URL } from '../../../../lib/exchange-settings';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!await requireExchangeSetup(request)) return NextResponse.json({ error: '관리자 로그인 또는 유효한 최초 연결 링크가 필요합니다.' }, { status: 401, headers });
  try {
    const row = await loadExchangeSettings();
    const sheetReady = await verifyExchangeSheetConnection();
    return NextResponse.json({ configured: !!row, connected: !!row?.chat_id && !!row.enabled, username: row?.username || EXPECTED_EXCHANGE_USERNAME, room: row?.chat_title || null, encryptionReady: /^[a-f0-9]{64}$/i.test(process.env.EXCHANGE_SETTINGS_KEY || ''), activatedAt: row?.activated_at || null, sheetReady }, { headers });
  } catch { return NextResponse.json({ error: '환전 시트 연결 또는 서버 설정을 확인해주세요.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (!await requireExchangeSetup(request)) return NextResponse.json({ error: '관리자 로그인 또는 유효한 최초 연결 링크가 필요합니다.' }, { status: 401, headers });
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ error: '운영 사이트에서만 연결할 수 있습니다.' }, { status: 403, headers });
  try {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid request' }, { status: 415, headers });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 4096) return NextResponse.json({ error: 'Invalid request' }, { status: 413, headers });
    const { token } = JSON.parse(raw);
    if (typeof token !== 'string' || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token.trim())) return NextResponse.json({ error: 'BotFather에서 받은 환전 전용 봇 토큰을 확인해주세요.' }, { status: 400, headers });
    const clean = token.trim();
    if ([process.env.TELEGRAM_BOT_TOKEN, process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN, process.env.RESERVATION_TELEGRAM_BOT_TOKEN].some(t => t && t.split(':')[0] === clean.split(':')[0])) return NextResponse.json({ error: '예약·회계봇이 아닌 환전 전용 봇 토큰이 필요합니다.' }, { status: 400, headers });
    await verifyExchangeSheetConnection();
    const me = await setupTelegram(clean, 'getMe');
    if (!me.is_bot || me.username !== EXPECTED_EXCHANGE_USERNAME || String(me.id) !== clean.split(':')[0]) return NextResponse.json({ error: '@dream_poker_exchange_bot의 토큰만 연결할 수 있습니다.' }, { status: 400, headers });
    const existing = await loadExchangeSettings();
    if (existing?.chat_id) return NextResponse.json({ error: '이미 환전방에 연결되어 있습니다. 기존 연결과 장부는 변경하지 않았습니다.' }, { status: 409, headers });
    const webhookUrl = `${EXCHANGE_PUBLIC_URL}/api/exchange/webhook`;
    const info = await setupTelegram(clean, 'getWebhookInfo');
    if (info.url && info.url !== webhookUrl) return NextResponse.json({ error: '이 봇은 다른 서버에 연결되어 있어 덮어쓰지 않았습니다. 기존 연결을 확인해주세요.' }, { status: 409, headers });
    const secret = randomBytes(32).toString('hex'), code = randomBytes(16).toString('hex'), now = new Date().toISOString();
    const values = { id: true, bot_id: String(me.id), username: me.username, encrypted_credentials: sealCredentials(clean, secret), activated_at: now, enabled: false, webhook_verified: false, pair_hash: hashPairCode(code), pair_expires_at: new Date(Date.now() + 15 * 60000).toISOString(), updated_at: now };
    const db = settingsDb();
    const saved = existing ? await db.from('dream_exchange_connection').update(values).eq('id', true).eq('updated_at', existing.updated_at).is('chat_id', null).select('id').single() : await db.from('dream_exchange_connection').insert(values).select('id').single();
    if (saved.error || !saved.data) throw Error('Configuration changed; retry');
    await setupTelegram(clean, 'setWebhook', { url: webhookUrl, secret_token: secret, max_connections: 1, allowed_updates: ['message', 'edited_message'], drop_pending_updates: false });
    const verified = await setupTelegram(clean, 'getWebhookInfo');
    if (verified.url !== webhookUrl) throw Error('Webhook not verified');
    const ready = await db.from('dream_exchange_connection').update({ webhook_verified: true }).eq('id', true).eq('updated_at', now).select('id').single();
    if (ready.error) throw Error('Configuration changed; retry');
    return NextResponse.json({ username: me.username, command: `/connect@${me.username} ${code}`, expiresInMinutes: 15, message: '환전봇을 Exchange 방의 관리자로 추가하고 아래 명령을 그 방에 보내주세요. 토큰은 암호화되어 저장됩니다.' }, { headers });
  } catch { return NextResponse.json({ error: '연결을 완료하지 못했습니다. 토큰과 서버 설정을 확인해주세요. 비밀값은 로그에 출력하지 않습니다.' }, { status: 503, headers }); }
}
