import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl,tg} from '../../../../lib/telegram';
import {accessToken} from '../../../../lib/accounting-google';
import {buildScheduleNotice,monthTab,scheduleWorkbook,vnDate,type ScheduleResult} from '../../../../lib/staff-schedule';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// One-shot owner-requested test of the shift notice: posts TODAY's shifts to the owner's report room only
// (never the staff room), at most once, and stops working after 2026-11-05 23:59 Vietnam time.
const expires=Date.parse('2026-11-05T23:59:59+07:00');
export async function GET(){
 if(process.env.VERCEL_ENV!=='production')return new NextResponse('Production only',{status:403});
 if(Date.now()>expires)return new NextResponse('Expired',{status:410});
 const chat=process.env.ACCOUNTING_REPORT_CHAT_ID;
 if(!chat)return NextResponse.json({status:'no_owner_room'},{status:503});
 const today=vnDate(Date.now(),0);
 let result:ScheduleResult;
 try{
  const range=encodeURIComponent(`'${monthTab(today)}'!A1:AH120`);
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${scheduleWorkbook}/values/${range}`,{headers:{Authorization:'Bearer '+await accessToken()},cache:'no-store',signal:AbortSignal.timeout(12000)});
  result=res.ok?buildScheduleNotice((await res.json()).values||[],today):{status:'missing' as const,date:today,reason:`출근표 시트를 읽지 못함 (${res.status})`};
 }catch{result={status:'missing' as const,date:today,reason:'출근표 시트를 읽지 못함'}}
 const text=result.status==='ready'?'[테스트] '+result.text.replace('내일','오늘'):`[테스트] 오늘(${today}) 근무 공지 실패: ${result.reason}${result.detail?.length?'\n'+result.detail.join('\n'):''}`;
 const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const key=`staff-schedule-test:${today}`;
 const claim=await db.from('dream_desk_reports').insert({report_key:key,chat_id:chat,report_date:today,update_id:0,status:'sending',body:text,summary:{kind:'staff_schedule_test',result:result.status}});
 if(claim.error)return NextResponse.json({status:claim.error.code==='23505'?'already_sent':'storage_unavailable'},{status:claim.error.code==='23505'?200:503});
 try{
  const sent=await tg('sendMessage',{chat_id:chat,text},15000);
  await db.from('dream_desk_reports').update({status:'sent',message_id:sent.message_id}).eq('report_key',key);
  return NextResponse.json({status:'sent',sheet:result.status});
 }catch{
  await db.from('dream_desk_reports').update({status:'uncertain'}).eq('report_key',key);
  return NextResponse.json({status:'delivery_uncertain',sheet:result.status},{status:503});
 }
}
