import { NextResponse } from 'next/server';
import { handleExchangeUpdate } from '../../../../lib/exchange-agent';
import { exchangeAuthorized } from '../../../../lib/exchange-telegram';
import { loadExchangeSettings, runtimeFromSettings, exchangeRuntime, pairExchangeRoom, setupTelegram } from '../../../../lib/exchange-settings';
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
let menuRegistered = false;
async function ensureCommandMenu() {
  if (menuRegistered) return;
  const config = exchangeConfig();
  await setupTelegram(config.token, 'setMyCommands', {
    scope: { type: 'chat', chat_id: config.chatId },
    commands: [
      { command: 'status', description: '현재 환전 시제' },
      { command: 'week', description: '이번 주 수익·정산' },
      { command: 'today', description: '오늘 거래 내역' },
      { command: 'fee', description: '이체수수료 추가 · 예: /fee 100 = 100만동' },
      { command: 'fee5', description: '이체수수료 5만동 기록' },
      { command: 'fee10', description: '이체수수료 10만동 기록' },
      { command: 'fxsnapshot', description: '최근 수기 시제 현황 게시' },
      { command: 'lastweek', description: '지난주 수익·정산' },
      { command: 'help', description: '사용법 · +5만 간편 입력' },
      { command: 'commands', description: '명령어 메뉴 다시 등록' },
    ],
  });
  await setupTelegram(config.token, 'setMyCommands', {
    language_code: 'ko',
    scope: { type: 'chat', chat_id: config.chatId },
    commands: [
      { command: 'status', description: '현재 환전 시제' },
      { command: 'week', description: '이번 주 수익·정산' },
      { command: 'today', description: '오늘 거래 내역' },
      { command: 'fee', description: '이체수수료 추가 · 예: /fee 100 = 100만동' },
      { command: 'fee5', description: '이체수수료 5만동 기록' },
      { command: 'fee10', description: '이체수수료 10만동 기록' },
      { command: 'fxsnapshot', description: '최근 수기 시제 현황 게시' },
      { command: 'lastweek', description: '지난주 수익·정산' },
      { command: 'help', description: '사용법 · +5만 간편 입력' },
      { command: 'commands', description: '명령어 메뉴 다시 등록' },
    ],
  });
  menuRegistered = true;
}
/** Register Telegram slash-command menu inside the linked room; only group admins may change it. */
async function handleCommandMenu(update: any, row: any): Promise<boolean> {
  const m = update?.message;
  if (!m || !['/commands','/commands@dream_poker_exchange_bot'].includes(String(m.text || '').trim().toLowerCase())) return false;
  if (!row.enabled || String(m.chat?.id) !== row.chat_id || !Number.isSafeInteger(m.from?.id) || m.from?.is_bot || m.sender_chat || m.forward_origin) return true;
  const config = exchangeConfig();
  const member = await exchangeTelegram('getChatMember', { chat_id: config.chatId, user_id: m.from.id }, config);
  if (!['administrator','creator'].includes(member.status)) return true;
  await ensureCommandMenu();
  await exchangeTelegram('sendMessage', {
    chat_id: config.chatId,
    text: '✅ 단축 명령어 메뉴 등록 완료. 메시지 입력창에 / 를 눌러보세요.\n+5만 → 이체수수료 5만동 기록',
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
      await ensureCommandMenu().catch(() => {});
      if (await handleCommandMenu(update, row)) return NextResponse.json({ ok: true });
      if (await handleSnapshotCommand(update, row)) return NextResponse.json({ ok: true });
      await handleExchangeUpdate(update);
      return NextResponse.json({ ok: true });
    });
  } catch { return NextResponse.json({ error: 'Exchange processing requires retry or review' }, { status: 503 }); }
}
