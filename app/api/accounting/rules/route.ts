import {NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'crypto';
import {requireAdmin,projectUrl} from '../../../../lib/telegram';
import {validateMemory} from '../../../../lib/accounting-memory';
import {gameMapping} from '../../../../lib/accounting-rules-display';
export const dynamic='force-dynamic';
const db=()=>createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
export async function GET(request:Request){
 if(!await requireAdmin(request))return NextResponse.json({error:'관리자 로그인이 필요해요.'},{status:403});
 const r=await db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id');
 return r.error?NextResponse.json({error:'규칙을 불러오지 못했어요.'},{status:500}):NextResponse.json({rules:r.data},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const user=await requireAdmin(request);if(!user)return NextResponse.json({error:'관리자 로그인이 필요해요.'},{status:403});
 const client=db(),owner=randomUUID();let locked=false;
 try{
  const b=await request.json();if(!['add','edit','delete'].includes(b.action))throw Error('작업을 확인해주세요.');
  if(b.action!=='add'&&(!Number.isSafeInteger(b.id)||typeof b.before!=='string'||typeof b.beforeKind!=='string'))throw Error('변경할 규칙을 다시 열어주세요.');
  const rule=b.action==='delete'?null:validateMemory({action:'save',kind:b.kind,content:b.content});
  if(rule&&'content' in rule&&typeof rule.content==='string'&&rule.content.startsWith('게임번호 대응: ')&&!gameMapping(rule.content))throw Error('날짜와 게임번호를 확인해주세요.');
  const l=await client.rpc('dream_accounting_acquire',{p_owner:owner});if(l.error||!l.data)return NextResponse.json({error:'정산 처리 중이에요. 잠시 후 다시 저장해주세요.'},{status:409});locked=true;
  if(b.action==='add'){
   const count=await client.from('dream_accounting_rules').select('id',{head:true,count:'exact'}).eq('active',true);
   if(count.error)throw Error('규칙 수를 확인하지 못했어요.');if((count.count||0)>=50)throw Error('규칙은 최대 50개예요. 사용하지 않는 규칙을 먼저 삭제해주세요.');
   const r=await client.from('dream_accounting_rules').insert({kind:(rule as any).kind,content:(rule as any).content,active:true,source_text:'관리 페이지에서 추가',sender_id:user.id}).select('id,kind,content').single();
   if(r.error)throw Error('저장하지 못했어요. 다시 시도해주세요.');return NextResponse.json({rule:r.data});
  }
  const patch=b.action==='delete'?{active:false}:{kind:(rule as any).kind,content:(rule as any).content};
  const r=await client.from('dream_accounting_rules').update(patch).eq('id',b.id).eq('active',true).eq('content',b.before).eq('kind',b.beforeKind).select('id,kind,content');
  if(r.error)throw Error('저장하지 못했어요. 다시 시도해주세요.');
  if(!r.data?.length)return NextResponse.json({error:'다른 관리자가 변경한 규칙이에요. 새로고침 후 다시 확인해주세요.'},{status:409});
  return NextResponse.json({rule:r.data[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'요청을 확인해주세요.'},{status:400});}
 finally{if(locked)await client.rpc('dream_accounting_release',{p_owner:owner});}
}
