import { NextResponse } from 'next/server';
import { handleExchangeUpdate } from '../../../../lib/exchange-agent';
import { exchangeAuthorized } from '../../../../lib/exchange-telegram';
import { loadExchangeSettings, runtimeFromSettings, exchangeRuntime, pairExchangeRoom } from '../../../../lib/exchange-settings';
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
      await handleExchangeUpdate(update);
      return NextResponse.json({ ok: true });
    });
  } catch { return NextResponse.json({ error: 'Exchange processing requires retry or review' }, { status: 503 }); }
}
