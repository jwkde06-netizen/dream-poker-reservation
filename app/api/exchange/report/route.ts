import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/telegram';
import { getExchangeReport } from '../../../../lib/exchange-agent';
import { validDate } from '../../../../lib/exchange-domain';
import { exchangeChatId } from '../../../../lib/exchange-telegram';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url), from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!validDate(from) || !validDate(to) || from! > to! || Date.parse(to!) - Date.parse(from!) > 366 * 86400000) return NextResponse.json({ error: 'Use a valid from/to date range of at most one year' }, { status: 400 });
  try { return NextResponse.json(await getExchangeReport(exchangeChatId(), from!, to!)); }
  catch { return NextResponse.json({ error: 'Exchange report is not available' }, { status: 503 }); }
}
