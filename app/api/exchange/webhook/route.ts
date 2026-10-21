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
  const lines = ['📊 DREAM EXCHANGE · 10/21 수기 확인 기준',
    '', '💵 현재 시제 (잠정)', '🇻🇳 VND 44,450,000', '🇺🇸 USD 100', '🇰🇷 KRW 1,380,000',
    '', '총 시제 평가액 73,880,000동', '', '💰 이번 주 수익 (잠정)',
    '수수료 등 1,050,000동', '환전 차익 930,000동', '누적 1,980,000동'];
  await exchangeTelegram('sendMessage', { chat_id: config.chatId, text: lines.join(String.fromCharCode(10)), reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } }, config);
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
      if (await handleSnapshotCommand(update, row)) return NextResponse.json({ ok: true });
      await handleExchangeUpdate(update);
      return NextResponse.json({ ok: true });
    });
  } catch { return NextResponse.json({ error: 'Exchange processing requires retry or review' }, { status: 503 }); }
}
