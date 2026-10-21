import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/telegram';
import { exchangeDb, getExchangeState } from '../../../lib/exchange-agent';
import { exchangeChatId } from '../../../lib/exchange-telegram';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const chatId = exchangeChatId();
    const [state, events, pending] = await Promise.all([
      getExchangeState(chatId),
      exchangeDb().from('dream_exchange_events').select('reference,business_date,kind,fee_vnd,fx_profit_vnd,expense_vnd,valuation_incomplete,plan,created_at').eq('chat_id', chatId).order('sequence', { ascending: false }).limit(50),
      exchangeDb().from('dream_exchange_jobs').select('update_id,message_id,status,reply_text,reply_state,created_at').eq('chat_id', chatId).in('status', ['review', 'failed']).order('created_at', { ascending: false }).limit(50),
    ]);
    if (events.error || pending.error) throw Error('Exchange lookup failed');
    return NextResponse.json({ state, events: events.data, pending: pending.data, enabled: process.env.EXCHANGE_ENABLED === 'true' });
  } catch { return NextResponse.json({ error: 'Exchange storage is not ready' }, { status: 503 }); }
}
