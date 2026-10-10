import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {projectUrl,publicKey,tg} from "../../../lib/telegram";
export const runtime="nodejs";
const fmt=(date:string)=>new Date(date).toLocaleString("ko-KR",{timeZone:"Asia/Ho_Chi_Minh",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"});
export async function POST(request:Request){
 if(!publicKey)return NextResponse.json({enabled:false},{status:200});
 try{
 const {token}=await request.json();
 if(typeof token!=="string"||!/^[a-f0-9-]{36}$/i.test(token))return NextResponse.json({error:"Invalid reservation reference"},{status:400});
 const db=createClient(projectUrl,publicKey,{auth:{persistSession:false}});
 const destination=await db.rpc("reservation_telegram_target");
 if(destination.error)return NextResponse.json({error:"Telegram group lookup failed"},{status:503});
 const target=String(destination.data||process.env.TELEGRAM_CHAT_ID||"").trim();
 if(!target)return NextResponse.json({error:"Telegram group is not linked. Check /staff Telegram settings."},{status:503});
 const {data,error}=await db.rpc("claim_poker_telegram_notification",{p_token:token});
 if(error)return NextResponse.json({error:"Notification lookup failed: "+error.message},{status:503});
 const booking=data?.[0];if(!booking)return NextResponse.json({ok:true,alreadyProcessed:true});
 const name=String(booking.player_name||"").slice(0,80);
 const note=String(booking.guest_note||"").slice(0,500);
 const lines=["♠ DREAM POKER · 신규 예약 신청","",`게임: ${booking.game_title}`,`테이블: ${booking.table_no||"-"} · No.${booking.game_no||"-"}`,`이름: ${name}`,booking.member_number?`회원번호: ${booking.member_number}`:"비회원 예약",`도착 예정: ${fmt(booking.arrival_at)} (베트남)`,note?`특이사항: ${note}`:"",`예약 ID: ${String(booking.reservation_id).slice(0,8)}`,"","캐셔 관리 화면에서 승인·대기·거절을 처리해주세요."].filter(Boolean);
 await tg("sendMessage",{chat_id:target,text:lines.join("\n"),reply_markup:{inline_keyboard:[[{text:"🔎 캐셔 예약 관리",url:"https://dream-poker-reservation.vercel.app/staff"}]]}});
 return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Telegram notification unavailable"},{status:502})}
}
