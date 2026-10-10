import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {projectUrl,publicKey,tg} from "../../../lib/telegram";
export const runtime="nodejs";
const fmt=(date:string)=>new Date(date).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit",hour12:false});
export async function POST(request:Request){
 if(!publicKey)return NextResponse.json({error:"Supabase key is missing"},{status:503});
 try{
 const {token}=await request.json();
 if(typeof token!=="string"||!/^[a-f0-9-]{36}$/i.test(token))return NextResponse.json({error:"Invalid reservation reference"},{status:400});
 const db=createClient(projectUrl,publicKey,{auth:{persistSession:false}});
 const destination=await db.rpc("reservation_telegram_target");
 if(destination.error&&!process.env.TELEGRAM_CHAT_ID)return NextResponse.json({error:"Telegram group lookup failed: "+destination.error.message},{status:503});
 const target=String(destination.data||process.env.TELEGRAM_CHAT_ID||"").trim();
 if(!target)return NextResponse.json({error:"Telegram group is not linked. Check /staff Telegram settings."},{status:503});
 const {data,error}=await db.rpc("claim_poker_telegram_notification",{p_token:token});
 let booking=data?.[0];
 if(error){
   const lookup=await db.rpc("lookup_poker_reservation",{p_token:token});
   if(lookup.error||!lookup.data?.[0])return NextResponse.json({error:"Reservation lookup failed: "+(lookup.error?.message||error.message)},{status:503});
   const item=lookup.data[0];
   const game=item.game_id?(await db.from("reservation_games").select("title,table_no,game_no").eq("id",item.game_id).maybeSingle()).data:null;
   booking={...item,reservation_id:item.reservation_id||item.id,game_title:item.game_title||game?.title||"Reservation",table_no:item.table_no||game?.table_no,game_no:item.game_no||game?.game_no};
 }
 if(!booking)return NextResponse.json({error:"No sendable booking returned by notification claim"},{status:409});
 const name=String(booking.player_name||"").slice(0,80);
 const note=String(booking.guest_note||"").slice(0,500);
 const title=String(booking.game_title||"Game").replace(/\\bTIME\\s*ATTACK\\b/gi,"").trim()||"Game";
 const lines=["🟢 NEW BOOKING / ĐẶT CHỖ MỚI",`${title} · Table ${booking.table_no||"—"} / No.${booking.game_no||"—"}`,`👤 ${name}`,`🕒 ETA ${fmt(booking.arrival_at)} (VN)`,note?`📝 ${note.slice(0,100)}`:""].filter(Boolean);
 await tg("sendMessage",{chat_id:target,text:lines.join("\n"),reply_markup:{inline_keyboard:[[{text:"📋 Open cashier / Mở trang thu ngân",url:"https://dream-poker-reservation.vercel.app/staff"}]]}});
 if(!error){const receipt=await db.rpc("confirm_poker_telegram_notification",{p_token:token});
 if(receipt.error)return NextResponse.json({ok:true,warning:"Telegram delivered; receipt update failed"});}
 return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Telegram notification unavailable"},{status:502})}
}
