import { ensureCommandMenu, logMenuFailure, EXCHANGE_COMMANDS, EXCHANGE_MENU_VERSION } from '../../../../lib/exchange-menu';
import { NextResponse } from 'next/server';
import { handleExchangeUpdate } from '../../../../lib/exchange-agent';
import { exchangeAuthorized } from '../../../../lib/exchange-telegram';
import { loadExchangeSettings, runtimeFromSettings, exchangeRuntime, pairExchangeRoom } from '../../../../lib/exchange-settings';
import { exchangeTelegram, exchangeConfig } from '../../../../lib/exchange-telegram';
/** Owner-approved one-time snapshot, never booked as a ledger transaction. */
async function handleSnapshotCommand(update: any, row: any): Promise<boolean> {
  const m = update?.message;
  if (!m || !['/fxsnapshot','/fxsnapshot@dream_poker_exchange_bot'].includes(String(m.text || '').trim().toLowerCase())) return false;
  if (!row.enabled || !row.chat_id || String(m.chat?.id) !== row.chat_id || !Number.isSafeInteger(m.from?.id) || m.from?.is_bot || m.sender_chat || m.forward_origin || m.forward_date) return true;
  const config = exchangeConfig();
  const member = await exchangeTelegram('getChatMember', { chat_id: config.chatId, user_id: m.from.id }, config);
  if (!['creator', 'administrator'].includes(member.status)) return true;
  const lines = ['/fxsnapshot은 과거 수기 시제입니다. 현재 시제 조회 기능을 이용해주세요.'];
  await exchangeTelegram('sendMessage', { chat_id: config.chatId, text: lines.join(String.fromCharCode(10)), reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, config);
  return true;
}
/** Register Telegram slash-command menu inside the linked room; only group admins may change it. */
async function handleCommandMenu(update: any, row: any): Promise<boolean> {
  const m = update?.message;
  if (!m || !['/commands','/commands@dream_poker_exchange_bot'].includes(String(m.text || '').trim().toLowerCase())) return false;
  if (!row.enabled || String(m.chat?.id) !== row.chat_id || !Number.isSafeInteger(m.from?.id) || m.from?.id <= 0 || m.from?.is_bot || m.sender_chat || m.via_bot || m.forward_origin || m.forward_date || !Number.isSafeInteger(m.date) || m.date < Math.floor(Date.parse(row.activated_at) / 1000)) return true;
  const config = exchangeConfig();
  const member = await exchangeTelegram('getChatMember', { chat_id: config.chatId, user_id: m.from.id }, config);
  if (!['administrator','creator'].includes(member.status)) return true;
  let menuReady = false;
  try { await ensureCommandMenu(true); menuReady = true; } catch (error) { logMenuFailure(error); }
  await exchangeTelegram('sendMessage', {
    chat_id: config.chatId,
    text: menuReady ? '✅ 단축 명령어 메뉴 등록·확인 완료. 환전 기록은 /fx, 원화 추가는 /krwin을 사용해주세요. 사용법은 /help\n메뉴가 바로 보이지 않으면 채팅방을 다시 열어주세요.' : '⚠️ Telegram 명령어 메뉴 등록을 확인하지 못했습니다. 잠시 후 /commands로 다시 시도해주세요. 메뉴 표시와 별개로 명령어를 직접 입력할 수 있습니다.',
    reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true },
  }, config);
  return true;
}
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(request: Request) {
  try {
    if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ error: 'Production only' }, { status: 403 });
    const row = await loadExchangeSettings();
    if (!row) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
    return await exchangeRuntime.run(runtimeFromSettings(row), async () => {
      if (!exchangeAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      if (Number(request.headers.get('content-length')) > 1000000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
      const body = await request.text();
      if (Buffer.byteLength(body) > 1000000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
      let update: any;
      try { update = JSON.parse(body); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
      if (await pairExchangeRoom(update, row)) return NextResponse.json({ ok: true });
      if (!row.chat_id) return NextResponse.json({ ok: true });
      if (!row.enabled) return NextResponse.json({ error: 'Paused' }, { status: 503 });
      if (await handleCommandMenu(update, row)) return NextResponse.json({ ok: true });
      await ensureCommandMenu().catch(logMenuFailure);
      if (await handleSnapshotCommand(update, row)) return NextResponse.json({ ok: true });
      await handleExchangeUpdate(update);
      return NextResponse.json({ ok: true });
    });
  } catch { return NextResponse.json({ error: 'Exchange processing requires retry or review' }, { status: 503 }); }
}

/** Public serving-version probe: no bot, group, credential or webhook operational data. */
export async function GET() {
  return NextResponse.json({ version: EXCHANGE_MENU_VERSION, commands: EXCHANGE_COMMANDS.map(item => item.command) }, { headers: { 'Cache-Control': 'no-store' } });
}
