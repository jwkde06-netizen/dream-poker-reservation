import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {projectUrl,tg} from '../../../../lib/telegram';
import {accessToken} from '../../../../lib/accounting-google';
import {buildScheduleNotice,monthTab,scheduleWorkbook,vnDate,type ScheduleResult} from '../../../../lib/staff-schedule';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const staffChat='-5322020390';

// Daily 23:00 (Vietnam) notice of tomorrow's shifts. Reads the attendance workbook only; never writes to it.
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,got=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(got)||!timingSafeEqual(Buffer.from(expected),Buffer.from(got)))return new NextResponse('Unauthorized',{status:401});
 if(process.env.VERCEL_ENV!=='production')return new NextResponse('Production only',{status:403});
 if(process.env.STAFF_TELEGRAM_CHAT_ID!==staffChat)return new NextResponse('Staff destination mismatch',{status:503});
 const now=Date.now(),tomorrow=vnDate(now,1);
 // Only send in the 22:00–23:59 Vietnam window so a late or replayed call can't post a stale notice.
 const vnHour=new Date(now+7*3600000).getUTCHours();
 if(vnHour<22)return NextResponse.json({status:'outside_window'});

 let result:ScheduleResult;
 try{
  const range=encodeURIComponent(`'${monthTab(tomorrow)}'!A1:AH120`);
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${scheduleWorkbook}/values/${range}`,{headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(12000)});
  result=res.ok?buildScheduleNotice((await res.json()).values||[],tomorrow):{status:'missing' as const,date:tomorrow,reason:res.status===400?`'${monthTab(tomorrow)}' 탭이 없음`:'출근표 시트를 읽지 못함'};
 }catch{result={status:'missing' as const,date:tomorrow,reason:'출근표 시트를 읽지 못함'}}

 // Incomplete schedules go to the owner's report room, never to staff.
 const ready=result.status==='ready';
 const chat=ready?staffChat:process.env.ACCOUNTING_REPORT_CHAT_ID;
 if(!chat)return NextResponse.json({status:'no_owner_room',result},{status:503});
 const text=result.status==='ready'?result.text:`⚠️ 내일(${tomorrow}) 근무 공지를 직원방에 안 보냈어요: ${result.reason}${result.detail?.length?'\n'+result.detail.join('\n'):''}`;
 const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const key=`staff-schedule:${tomorrow}`;
 const claim=await db.from('dream_desk_reports').insert({report_key:key,chat_id:chat,report_date:tomorrow,update_id:0,status:'sending',body:text,summary:{kind:'staff_schedule',result:result.status}});
 if(claim.error)return NextResponse.json({status:claim.error.code==='23505'?'already_claimed':'storage_unavailable'},{status:claim.error.code==='23505'?200:503});
 try{
  const sent=await tg('sendMessage',{chat_id:chat,text},15000);
  const saved=await db.from('dream_desk_reports').update({status:'sent',message_id:sent.message_id}).eq('report_key',key);
  if(saved.error)throw Error('Receipt persistence failed');
  return NextResponse.json({status:ready?'sent':'owner_alerted'});
 }catch{
  await db.from('dream_desk_reports').update({status:'uncertain'}).eq('report_key',key);
  return NextResponse.json({status:'delivery_uncertain'},{status:503});
 }
}
