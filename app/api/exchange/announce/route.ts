import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { withSavedExchange } from '../../../../lib/exchange-settings';
import { exchangeTelegram } from '../../../../lib/exchange-telegram';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const msg = [
  '📊 DREAM EXCHANGE',
  '',
  '💵 현재 시제 (잠정)',
  '🇻🇳 VND 70,450,000',
  '🇺🇸 USD 100',
  '🇰🇷 KRW 1,380,000',
  '',
  '💰 이번 주 수익 (잠정)',
  '수수료 등 1,050,000동',
  '환전 차익 930,000동',
  '총 1,980,000동',
].join('\n');
export async function POST(request: Request) {
  const key = request.headers.get('x-exchange-announcement') || '';
  const expected = process.env.EXCHANGE_ANNOUNCE_HASH || '';
  const hash = createHash('sha256').update(key).digest('hex');
  const a=Buffer.from(hash), b=Buffer.from(expected);
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(key) || a.length !== b.length || !timingSafeEqual(a,b) || Date.now() >= Date.parse(process.env.EXCHANGE_ANNOUNCE_EXPIRES_AT||'')) return NextResponse.json({error:'Unauthorized'},{status:401});
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({error:'Not production'},{status:403});
  try {
    const sent = await withSavedExchange(async row => {
      if (!row.enabled || !row.chat_id) throw Error('Not connected');
      return exchangeTelegram('sendMessage',{chat_id:row.chat_id,text:msg},{...((await import('../../../../lib/exchange-telegram')).exchangeConfig())});
    });
    return NextResponse.json({sent:true,message_id:sent.message_id,chat:'Exchange'},{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({sent:false,error:'Could not deliver'},{status:503}); }
}
