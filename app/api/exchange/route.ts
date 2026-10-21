import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/telegram';
import { exchangeDb, getExchangeState } from '../../../lib/exchange-agent';
import { withSavedExchange } from '../../../lib/exchange-settings';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401, headers });
  try {
    return await withSavedExchange(async row => {
      const chatId = row.chat_id!;
      const [state, events, pending] = await Promise.all([
        getExchangeState(chatId),
        exchangeDb().from('dream_exchange_events').select('reference,business_date,kind,fee_vnd,fx_profit_vnd,expense_vnd,valuation_incomplete,plan,created_at').eq('chat_id', chatId).order('sequence', { ascending: false }).limit(100),
        exchangeDb().from('dream_exchange_jobs').select('update_id,message_id,status,reply_text,reply_state,created_at').eq('chat_id', chatId).in('status', ['review', 'failed']).order('created_at', { ascending: false }).limit(50),
      ]);
      if (events.error || pending.error) throw Error('Exchange lookup failed');
      return NextResponse.json({ state, events: events.data, pending: pending.data, enabled: row.enabled, room: row.chat_title }, { headers });
    });
  } catch { return NextResponse.json({ error: '환전방 연결을 먼저 완료해주세요.' }, { status: 503, headers }); }
}
