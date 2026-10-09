import {createClient} from "@supabase/supabase-js";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://sncvmxhhsocuamjjwgvz.supabase.co";
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
export const configured=Boolean(key);
export const db=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}}):null;
