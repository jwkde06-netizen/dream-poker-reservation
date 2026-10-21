import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {projectUrl,publicKey} from '../../../../lib/telegram';
export const runtime='nodejs';
export async function POST(request:Request){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token||!publicKey)return NextResponse.json({error:'Authentication required'},{status:401});
 const body=await request.json().catch(()=>null);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(body?.reservation_id||'')||!uuid.test(body?.game_id||'')||!Number.isInteger(body?.expected_version))return NextResponse.json({error:'Reload the reservation and try again'},{status:400});
 const client=createClient(projectUrl,publicKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return NextResponse.json({error:'Authentication required'},{status:401});
 const {data,error}=await client.rpc('assign_poker_reservation',{p_id:body.reservation_id,p_game:body.game_id,p_expected_version:body.expected_version});
 if(error||!data)return NextResponse.json({error:error?.message||'Assignment failed'},{status:409});
 return NextResponse.json({ok:true});
}
