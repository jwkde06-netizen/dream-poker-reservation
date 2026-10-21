import { NextResponse } from 'next/server';
import { withSavedExchange, settingsDb } from '../../../../lib/exchange-settings';
import { exchangeTelegram } from '../../../../lib/exchange-telegram';
import { getExchangeReport } from '../../../../lib/exchange-agent';
import { vietnamDate } from '../../../../lib/exchange-domain';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const num=(n:number)=>n.toLocaleString('en-US');
function reportDay(now:number) {
  const vn=vietnamDate(Math.floor(now/1000));
  const d=new Date(vn+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
function monday(day:string) {
  const d=new Date(day+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
  return d.toISOString().slice(0,10);
}
export async function GET(request:Request) {
  const expected=process.env.CRON_SECRET;
  if(!expected || request.headers.get('authorization')!=='Bearer '+expected) return new NextResponse('Unauthorized',{status:401});
  if(process.env.VERCEL_ENV!=='production') return new NextResponse('Production only',{status:403});
  // The cron runs at 03:30 Vietnam time, reporting the just-finished previous business day.
  const now=new Date(Date.now()+7*3600*1000);
  // Monday 03:30 in Vietnam reports the previous completed Mon–Sun week.
  if(now.getUTCDay()!==1)return NextResponse.json({status:'not_weekly_settlement_day'});
  const day=reportDay(Date.now());
  try {
    return await withSavedExchange(async row=>{
      if(!row.enabled || !row.chat_id)return new NextResponse('Exchange inactive',{status:503});
      const db=settingsDb();
      const start=monday(day);
      const weekly=await getExchangeReport(row.chat_id!,start,day); const daily=weekly;
      if(!daily.initialized || !weekly.initialized) return new NextResponse('Float not initialized',{status:503});
      const fees=Number(daily.fee_vnd),fx=Number(daily.realized_fx_vnd),cost=Number(daily.expense_vnd),net=Number(daily.net_known_vnd);
      const count=Number(daily.transaction_count),weekNet=Number(weekly.net_known_vnd);
      if([fees,fx,cost,net,count,weekNet].some(v=>!Number.isSafeInteger(v)) || fees+fx-cost!==net)throw Error('Invalid totals');
      const [year,month,date]=day.split('-');
      const sources=[{name:'이체수수료',value:fees},{name:'환전 차익',value:fx}].sort((a,b)=>b.value-a.value);
      const leading=sources[0].value>0?sources[0].name:'수익 없음';
      const lines=['📊 DREAM EXCHANGE','주간 정산 · '+start+' ~ '+day','',
        '💰 이번 주 수익','이체수수료 '+num(fees)+'동','환전 차익 '+num(fx)+'동'];
      if(cost)lines.push('비용 '+num(cost)+'동');
      lines.push('','주간 순수익 '+num(net)+'동','주간 거래 '+num(count)+'건 · 최다 수익 '+leading,'',
        '이번 주 누적 '+num(weekNet)+'동');
      if(true){
        const your=Math.floor(weekNet/2),danny=weekNet-your;
        lines.push('','📅 일요일 주간 정산','지원 50% '+num(your)+'동','Danny 50% '+num(danny)+'동',
          '※ 지급 확인 전 · 정산 예정');
      }
      const message=lines.join(String.fromCharCode(10));
      const claim=await db.rpc('dream_exchange_daily_claim',{p_chat_id:row.chat_id,p_report_date:day});
      if(claim.error)throw Error('Daily claim failed');
      if(claim.data!==true)return NextResponse.json({status:'already_claimed',day});
      try{
        const sent=await exchangeTelegram('sendMessage',{chat_id:row.chat_id,text:message,disable_notification:false});
        await db.from('dream_exchange_daily_reports').update({status:'sent',message_id:sent.message_id,sent_at:new Date().toISOString()}).eq('chat_id',row.chat_id).eq('report_date',day);
        return NextResponse.json({status:'sent',day});
      }catch{
        await db.from('dream_exchange_daily_reports').update({status:'uncertain'}).eq('chat_id',row.chat_id).eq('report_date',day);
        return NextResponse.json({status:'delivery_uncertain',day},{status:503});
      }
    });
  } catch {return new NextResponse('Report failed',{status:503});}
}
