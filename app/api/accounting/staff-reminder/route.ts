import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {timingSafeEqual} from 'node:crypto';
import {projectUrl,tg} from '../../../../lib/telegram';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,got=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(got)||!timingSafeEqual(Buffer.from(expected),Buffer.from(got)))return new NextResponse('Unauthorized',{status:401});
 if(process.env.VERCEL_ENV!=='production')return new NextResponse('Production only',{status:403});
 const now=Date.now(),due=Date.parse('2026-10-23T15:30:00+07:00');
 // This is a single authorized announcement, never a recurring daily notice.
 if(now<due||now>=due+3600000)return NextResponse.json({status:'outside_window'});
 const chat='-5322020390';
 if(process.env.STAFF_TELEGRAM_CHAT_ID!==chat)return new NextResponse('Staff destination mismatch',{status:503});
 const db=createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 const key='staff-receipts:2026-10-23:1530';
 const text='오늘 바이인 명단과 리바인 용지, F&B 영수증은 사진 찍어서 이 방에 올려주세요. 봇이 확인해서 정산 시트에 기록합니다.';
 const claim=await db.from('dream_desk_reports').insert({report_key:key,chat_id:chat,report_date:null,update_id:0,status:'sending',body:text,summary:{kind:'staff_reminder',scheduledFor:'2026-10-23T15:30:00+07:00'}});
 if(claim.error)return NextResponse.json({status:claim.error.code==='23505'?'already_claimed':'storage_unavailable'},{status:claim.error.code==='23505'?200:503});
 try{
  const sent=await tg('sendMessage',{chat_id:chat,text},15000);
  const saved=await db.from('dream_desk_reports').update({status:'sent',message_id:sent.message_id}).eq('report_key',key);
  if(saved.error)throw Error('Receipt persistence failed');
  return NextResponse.json({status:'sent'});
 }catch{
  await db.from('dream_desk_reports').update({status:'uncertain'}).eq('report_key',key);
  return NextResponse.json({status:'delivery_uncertain'},{status:503});
 }
}
