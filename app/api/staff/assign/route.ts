import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {projectUrl,publicKey} from "../../../../lib/telegram";
export const runtime="nodejs";
export async function POST(request:Request){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token||!publicKey)return NextResponse.json({error:"Authentication required"},{status:401});
 const caller=createClient(projectUrl,publicKey,{auth:{persistSession:false}});
 const {data:{user},error:authError}=await caller.auth.getUser(token);
 if(authError||!user)return NextResponse.json({error:"Authentication required"},{status:401});
 const {data:profile}=await caller.from("user_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(!profile?.active||!["admin","cashier","staff"].includes(profile.role))return NextResponse.json({error:"Cashier access required"},{status:403});
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)return NextResponse.json({error:"Server admin key not configured"},{status:503});
 const body=await request.json().catch(()=>null);
 const reservationId=String(body?.reservation_id||""),gameId=String(body?.game_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(reservationId)||!/^[0-9a-f-]{36}$/i.test(gameId))return NextResponse.json({error:"Invalid reservation or game"},{status:400});
 const admin=createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:booking,error:bookingError}=await admin.from("reservations").select("id,game_id,status").eq("id",reservationId).maybeSingle();
 if(bookingError||!booking)return NextResponse.json({error:"Reservation not found"},{status:404});
 if(["rejected","cancelled","checked_in","no_show"].includes(booking.status))return NextResponse.json({error:"This reservation cannot be reassigned"},{status:409});
 const {data:game,error:gameError}=await admin.from("reservation_games").select("id,is_open,capacity").eq("id",gameId).maybeSingle();
 if(gameError||!game?.is_open)return NextResponse.json({error:"Target game is not open"},{status:409});
 if(["confirmed"].includes(booking.status)){
  const {count,error}=await admin.from("reservations").select("id",{count:"exact",head:true}).eq("game_id",gameId).in("status",["confirmed","checked_in"]).neq("id",reservationId);
  if(error)return NextResponse.json({error:error.message},{status:500});
  if((count||0)>=Number(game.capacity))return NextResponse.json({error:"Target game is full"},{status:409});
 }
 const {error}=await admin.from("reservations").update({game_id:gameId}).eq("id",reservationId).eq("game_id",booking.game_id);
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({ok:true});
}
