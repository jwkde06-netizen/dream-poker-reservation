import { NextResponse } from 'next/server';
import { parseGoogleKrwVnd } from '../../../../lib/exchange-agent';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public Google quote only. No settings, accounts, or ledger access. */
export async function GET() {
  let diagnostic:Record<string,unknown>={};
  try {
    const response=await fetch('https://www.google.com/finance/quote/KRW-VND?hl=en',{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const html=await response.text();
    diagnostic={status:response.status,url:response.url,title:html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],excerpt:html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1800)};
    if(!response.ok)throw Error('Google HTTP failure');
    return NextResponse.json({base:'KRW',quote:'VND',rate:parseGoogleKrwVnd(html),checkedAt:new Date().toISOString(),source:'Google Finance'},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:'Quote unavailable',diagnostic},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
