import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {requireAdmin,projectUrl} from "../../../lib/telegram";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const roleSet=new Set(["admin","cashier","desk"]);
export async function POST(request:Request){
  const administrator=await requireAdmin(request);
  if(!administrator)return NextResponse.json({error:"Administrator access required"},{status:403});
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)return NextResponse.json({error:"Server service role key has not been configured"},{status:503});
  const body=await request.json().catch(()=>null);
  const username=String(body?.username||"").trim().toLowerCase();
  const password=String(body?.password||"");
  const displayName=String(body?.display_name||username).trim().slice(0,80);
  const role=String(body?.role||"cashier");
  if(!/^[a-z][a-z0-9_]{3,31}$/.test(username)||password.length<12||!roleSet.has(role))
    return NextResponse.json({error:"Username must be 4–32 characters; password at least 12 characters"},{status:400});
  const client=createClient(projectUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=username+"@reservation.dream-poker.invalid";
  const created=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username,display_name:displayName}});
  if(created.error||!created.data.user)return NextResponse.json({error:created.error?.message||"Failed to create account"},{status:409});
  const userId=created.data.user.id;
  const stored=await client.from("user_profiles").upsert({user_id:userId,role,display_name:displayName,active:true},{onConflict:"user_id"});
  if(stored.error){await client.auth.admin.deleteUser(userId);return NextResponse.json({error:"Profile creation failed: "+stored.error.message},{status:500})}
  return NextResponse.json({ok:true,username,role});
}
