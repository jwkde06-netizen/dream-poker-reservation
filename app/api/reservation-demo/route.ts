import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {applyDemoCommand,DemoError,initialDemoState,type DemoCommand} from '../../../lib/reservation-demo';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=/^[0-9a-f]{64}$/i;
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
function database(){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)throw Error('Demo storage unavailable');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://sncvmxhhsocuamjjwgvz.supabase.co',secret,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})}});
}
function credentials(request:Request){
 const room=new URL(request.url).searchParams.get('room')||'';
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!uuid.test(room)||!key.test(token))throw new DemoError('session');
 return {p_room:room,p_key_hash:hash(token)};
}
// Only fake, expiring demo rooms are reachable here. These routes never invoke booking or Telegram RPCs.
export async function GET(request:Request){
 try{const auth=credentials(request);const r=await database().rpc('load_reservation_demo',auth);
  if(r.error)throw Error('Demo storage unavailable');if(!r.data)return response({error:'session'},403);return response(r.data);
 }catch(e){return response({error:e instanceof DemoError?e.code:'connection'},e instanceof DemoError?403:503);}
}
export async function POST(request:Request){
 try{
  // Same-origin browser mutations only; no permissive CORS or cookie authentication.
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'role'},403);
  const raw=await request.text();if(raw.length>12000)return response({error:'invalid'},400);
  const input=JSON.parse(raw);const db=database();
  if(input.op==='create'){
   if(!uuid.test(input.room)||!key.test(input.deskKey)||!key.test(input.cashierKey)||input.deskKey===input.cashierKey)return response({error:'invalid'},400);
   const r=await db.rpc('create_reservation_demo',{p_room:input.room,p_desk_hash:hash(input.deskKey),p_cashier_hash:hash(input.cashierKey),p_state:initialDemoState()});
   if(r.error){if(r.error.message.includes('limit'))return response({error:'limit'},429);throw Error('Demo storage unavailable');}
   return response(r.data);
  }
  const auth=credentials(request),command=input.command as DemoCommand;
  if(!command||!uuid.test(command.id))return response({error:'invalid'},400);
  const fingerprint=hash(JSON.stringify(command));
  for(let attempt=0;attempt<4;attempt++){
   const loaded=await db.rpc('load_reservation_demo',{...auth,p_request:command.id,p_fingerprint:fingerprint});
   if(loaded.error){if(loaded.error.message.includes('Idempotency'))return response({error:'invalid'},409);throw Error('Demo storage unavailable');}
   if(!loaded.data)return response({error:'session'},403);
   if(loaded.data.replayed)return response(loaded.data);
   const state=applyDemoCommand(loaded.data.state,command,loaded.data.role,new Date().toISOString());
   const committed=await db.rpc('commit_reservation_demo',{...auth,p_request:command.id,p_fingerprint:fingerprint,p_expected_revision:loaded.data.revision,p_state:state});
   if(committed.error)throw Error('Demo commit unavailable');if(!committed.data)return response({error:'session'},403);
   if(!committed.data.conflict)return response(committed.data);
  }
  return response({error:'connection'},503);
 }catch(e){if(e instanceof DemoError)return response({error:e.code},422);if(e instanceof SyntaxError)return response({error:'invalid'},400);return response({error:'connection'},503);}
}
