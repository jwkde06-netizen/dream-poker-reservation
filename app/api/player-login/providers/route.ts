import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"https://sncvmxhhsocuamjjwgvz.supabase.co";
 const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 let google=false,kakao=false;
 if(key)try{
  const response=await fetch(`${url}/auth/v1/settings`,{headers:{apikey:key},signal:AbortSignal.timeout(5000),cache:"no-store"});
  if(response.ok){const {external}=await response.json();google=external?.google===true;kakao=external?.kakao===true;}
 }catch{/* A provider outage must not prevent guest reservations. */}
 return NextResponse.json({google,kakao},{headers:{"Cache-Control":"no-store"}});
}
