import {createClient} from "@supabase/supabase-js";
export const telegramToken=process.env.TELEGRAM_BOT_TOKEN||"";
export const projectUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://sncvmxhhsocuamjjwgvz.supabase.co";
export const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
export async function requireAdmin(request:Request){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token||!publicKey)return null;
 const client=createClient(projectUrl,publicKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser(token);
 if(error||!user)return null;
 const {data:profile}=await client.from("user_profiles").select("role,active").eq("user_id",user.id).maybeSingle();
 return profile?.active&&profile.role==="admin"?user:null;
}
export async function tg(method:string,payload?:Record<string,unknown>){
 if(!telegramToken)throw Error("TELEGRAM_BOT_TOKEN is not configured");
 const res=await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`,{
 method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload||{}),cache:"no-store"});
 const json=await res.json();
 if(!res.ok||!json.ok)throw Error(json.description||"Telegram request failed");
 return json.result;
}
