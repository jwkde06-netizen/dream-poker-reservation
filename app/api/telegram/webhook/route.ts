import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {projectUrl,tg} from "../../../../lib/telegram";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const secret=process.env.TELEGRAM_WEBHOOK_SECRET||"";
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY||"";
const allowed=()=>new Set((process.env.TELEGRAM_APPROVER_IDS||"").split(",").map(v=>v.trim()).filter(Boolean));
export async function POST(request:Request){
 if(!secret||!serviceKey||request.headers.get("x-telegram-bot-api-secret-token")!==secret)
   return NextResponse.json({error:"Unauthorized"},{status:401});
 let data:any;
 try{data=await request.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 const cb=data?.callback_query;
 if(!cb)return NextResponse.json({ok:true});
 const id=String(cb.from?.id||"");
 const match=/^reservation:(approve|reject):([a-f0-9-]{36})$/i.exec(String(cb.data||""));
 const answer=async(message:string)=>{await tg("answerCallbackQuery",{callback_query_id:cb.id,text:message,show_alert:true}).catch(()=>{})};
 if(!match){await answer("Invalid reservation action");return NextResponse.json({ok:true})}
 if(!allowed().has(id)){await answer("승인 권한이 없습니다 / Not authorized");return NextResponse.json({ok:true})}
 const chat=String(cb.message?.chat?.id||"");
 // Reject callbacks copied or forwarded outside the configured cashier group.
 const db=createClient(projectUrl,serviceKey,{auth:{persistSession:false}});
 const {data:destination,error:destError}=await db.rpc("reservation_telegram_target");
 const configuredChat=String(destination||process.env.TELEGRAM_CHAT_ID||"");
 if((destError&&!process.env.TELEGRAM_CHAT_ID)||!chat||chat!==configuredChat){await answer("Unrecognized cashier group");return NextResponse.json({ok:true})}
 const action=match[1]==="approve"?"confirmed":"rejected";
 const {data:result,error}=await db.rpc(process.env.DREAM_DESK_ENABLED==="true"?"desk_telegram_decide":"telegram_decide_poker_reservation",{
   p_id:match[2],p_status:action,p_actor:"telegram:"+id
 });
 if(error){await answer("처리 실패: "+error.message.slice(0,130));return NextResponse.json({ok:true})}
 const value=String(result);
 if(value!=="confirmed"&&value!=="rejected"){
   await answer(value==="full"?"좌석이 모두 찼습니다 / Game full":value.startsWith("already_")?"이미 처리된 예약입니다 / Already processed":"예약을 찾지 못했습니다");
   return NextResponse.json({ok:true});
 }
 const display=cb.from?.first_name||id;
 const label=value==="confirmed"?"✅ 예약 승인 / Confirmed":"❌ 예약 거절 / Rejected";
 const original=String(cb.message?.text||"").split("\n\n🔒")[0];
 try{await tg("editMessageText",{chat_id:chat,message_id:cb.message.message_id,
   text:original+"\n\n🔒 "+label+"\n👤 "+display,
   reply_markup:{inline_keyboard:[[{text:"📋 캐셔 화면 / Cashier",url:process.env.NEXT_PUBLIC_SITE_URL||"https://dream-poker-reservation.vercel.app/staff"}]]}
 })}catch{}
 await tg("answerCallbackQuery",{callback_query_id:cb.id,text:label}).catch(()=>{});
 return NextResponse.json({ok:true});
}
