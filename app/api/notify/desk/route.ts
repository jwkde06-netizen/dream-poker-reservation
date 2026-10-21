import {dispatch} from "../../../../lib/desk";
import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {projectUrl,publicKey,tg} from "../../../../lib/telegram";
export const runtime="nodejs";
export async function POST(request:Request){
 const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!bearer||!publicKey)return NextResponse.json({error:"Staff login required"},{status:401});
 const db=createClient(projectUrl,publicKey,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false}});
 const {data:{user}}=await db.auth.getUser(bearer);
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {data:profile}=await db.from("user_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(!profile?.active||!["desk","cashier","staff","admin"].includes(profile.role))return NextResponse.json({error:"Staff only"},{status:403});
 let body:any;
 try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 const gameId=String(body.game_id||""),name=String(body.name||"").trim(),arrival=String(body.arrival_at||"");
 if(!/^[a-f0-9-]{36}$/i.test(gameId)||name.length<2||name.length>80||!Number.isFinite(Date.parse(arrival)))return NextResponse.json({error:"Invalid booking"},{status:400});
 // A single exact reservation must exist immediately after the authenticated desk RPC.
 const since=new Date(Date.now()-120000).toISOString();
 const {data:matches,error}=await db.from("reservations").select("id,game_id,player_name,arrival_at,status,created_at")
   .eq("game_id",gameId).eq("player_name",name).eq("status","pending").gte("created_at",since)
   .order("created_at",{ascending:false}).limit(10);
 if(error)return NextResponse.json({error:error.message},{status:502});
 const candidates=(matches||[]).filter(b=>Math.abs(Date.parse(b.arrival_at)-Date.parse(arrival))<60000);
 if(candidates.length!==1)return NextResponse.json({error:"Unable to identify one new reservation; cashier can still see it in the queue"},{status:409});
 const game=await db.from("reservation_games").select("title,table_no,game_no").eq("id",gameId).single();
 const destination=await db.rpc("reservation_telegram_target");
 const target=String(destination.data||process.env.TELEGRAM_CHAT_ID||"").trim();
 if(!target)return NextResponse.json({error:"Telegram group is not configured"},{status:503});
 const b=candidates[0],g=game.data;
 const eta=new Date(b.arrival_at).toLocaleTimeString("en-GB",{timeZone:"Asia/Ho_Chi_Minh",hour:"2-digit",minute:"2-digit"});
 try{
  if(process.env.DREAM_DESK_ENABLED==="true"){const result=await dispatch();return NextResponse.json({ok:result.failed===0,...result});}
  await tg("sendMessage",{chat_id:target,text:[
   "🟡 KOREAN DESK / 한국인 데스크 예약 요청",
   (g?.title||"Game")+" · Table "+(g?.table_no||"—")+" / No."+(g?.game_no||"—"),
   "👤 "+name,"🕒 ETA "+eta+" (VN)","📨 Requested by Korean Desk"
  ].join("\n"),reply_markup:{inline_keyboard:[
   [{text:"✅ 승인 / Duyệt",callback_data:"reservation:approve:"+b.id},{text:"❌ 거절 / Từ chối",callback_data:"reservation:reject:"+b.id}],
   [{text:"📋 캐셔 화면 / Cashier",url:process.env.NEXT_PUBLIC_SITE_URL||"https://dream-poker-reservation.vercel.app/staff"}]
  ]}});
  return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Telegram unavailable"},{status:502})}
}
