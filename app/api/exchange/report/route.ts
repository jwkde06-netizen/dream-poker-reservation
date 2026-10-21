import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/telegram';
import { getExchangeReport } from '../../../../lib/exchange-agent';
import { validDate } from '../../../../lib/exchange-domain';
import { withSavedExchange } from '../../../../lib/exchange-settings';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  if (!await requireAdmin(request)) return NextResponse.json({ error: '관리자 로그인이 필요합니다.' }, { status: 401, headers });
  const url = new URL(request.url), from = url.searchParams.get('from'), to = url.searchParams.get('to');
  if (!validDate(from) || !validDate(to) || from! > to! || Date.parse(to!) - Date.parse(from!) > 366 * 86400000) return NextResponse.json({ error: '1년 이내의 유효한 시작일과 종료일을 선택해주세요.' }, { status: 400, headers });
  try { return await withSavedExchange(async row => NextResponse.json(await getExchangeReport(row.chat_id!, from!, to!), { headers })); }
  catch { return NextResponse.json({ error: '환전 보고서를 조회할 수 없습니다.' }, { status: 503, headers }); }
}
