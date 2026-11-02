import { NextResponse } from 'next/server';
import { googleKrwVnd } from '../../../../lib/exchange-agent';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public market quote only; never reads settings, balances, or writes a ledger. */
export async function GET() {
  try {
    const quote = await googleKrwVnd();
    return NextResponse.json({ base: 'KRW', quote: 'VND', ...quote, source: 'Google Finance' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Google KRW/VND quote unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
