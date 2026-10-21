import { NextResponse } from 'next/server';
import { handleExchangeUpdate } from '../../../../lib/exchange-agent';
import { exchangeAuthorized } from '../../../../lib/exchange-telegram';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
export async function POST(request: Request) {
  if (!exchangeAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.EXCHANGE_ENABLED !== 'true') return NextResponse.json({ error: 'Exchange not activated' }, { status: 503 });
  try {
    if (Number(request.headers.get('content-length')) > 1000000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
    const body = await request.text();
    if (Buffer.byteLength(body, 'utf8') > 1000000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
    await handleExchangeUpdate(JSON.parse(body));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Exchange processing requires retry or review' }, { status: 503 }); }
}
