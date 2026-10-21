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
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)return NextResponse.json({error:"Server admin key not configured"},{status:503});
 // Resolve trusted roles with server credentials so a restrictive RLS policy cannot hide a valid account.
 const admin=createClient(projectUrl,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await admin.from("user_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 if(profileError)return NextResponse.json({error:"Unable to verify account permissions"},{status:500});
 if(!profile?.active)return NextResponse.json({error:"Account is not active or has no reservation profile"},{status:403});
 if(!["admin","cashier","staff"].includes(profile.role))return NextResponse.json({error:"Table assignment is limited to cashiers and administrators"},{status:403});
 const body=await request.json().catch(()=>null);
 const reservationId=String(body?.reservation_id||""),gameId=String(body?.game_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(reservationId)||!/^[0-9a-f-]{36}$/i.test(gameId))return NextResponse.json({error:"Invalid reservation or game"},{status:400});
 const {data,error}=await admin.rpc("dream_reservation_apply",{p_action:{kind:"assign",reservation_id:reservationId,game_id:gameId},p_actor:"staff:"+user.id,p_source:"assign:"+user.id+":"+crypto.randomUUID()});
 if(error)return NextResponse.json({error:error.message},{status:409});
 if(!data?.ok)return NextResponse.json({error:"Assignment outcome could not be verified"},{status:503});
 return NextResponse.json(data);
}
