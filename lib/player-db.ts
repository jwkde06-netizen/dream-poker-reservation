import {createClient} from "@supabase/supabase-js";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://sncvmxhhsocuamjjwgvz.supabase.co";
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
// Keep player OAuth separate from the desk's password session on shared devices.
export const playerDb=key?createClient(url,key,{auth:{storageKey:"dream-player-auth-v1",flowType:"pkce",persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export type PlayerIdentity={id:string;name:string};
