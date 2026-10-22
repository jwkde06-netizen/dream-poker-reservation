import {NextResponse} from 'next/server';
import {requireAdmin} from '../../../../lib/telegram';
import {authorized,db} from '../../../../lib/accounting-agent';
import {createCashierReview,publishCashierReview} from '../../../../lib/cashier-service';
import {extractCashierDraft} from '../../../../lib/cashier-vision';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const json=(b:unknown,status=200)=>NextResponse.json(b,{status,headers:{'Cache-Control':'no-store'}});
async function actor(r:Request){if(authorized(r,'ACCOUNTING_OPS_SECRET'))return 'accounting-ops';return (await requireAdmin(r))?.id;}
export async function GET(r:Request){
 if(!await actor(r))return json({error:'Unauthorized'},401);
 const q=await db().from('dream_cashier_reviews').select('id,source_id,source_hash,review,created_at').order('created_at',{ascending:false}).limit(20);
 return q.error?json({error:'대조 이력을 불러오지 못했습니다.'},503):json({reviews:q.data});
}
export async function POST(r:Request){
 const user=await actor(r);if(!user)return json({error:'Unauthorized'},401);
 if(Number(r.headers.get('content-length'))>4000000)return json({error:'Too large'},413);
 try{
  const raw=await r.text();if(Buffer.byteLength(raw)>4000000)return json({error:'Too large'},413);
  const b=JSON.parse(raw);
  if(b.action==='extract'){
   if(typeof b.sourceId!=='string'||!b.sourceId.trim()||b.sourceId.length>200)return json({error:'원본 식별자가 필요합니다.'},400);
   return json(await extractCashierDraft(b.sourceId,b.images));
  }
  if(b.action==='publish'){
   if(!/^[a-f0-9-]{36}$/.test(b.id)||!/^[a-f0-9]{64}$/.test(b.sourceHash))return json({error:'대조 이력을 확인해주세요.'},400);
   return json(await publishCashierReview(b.id,b.sourceHash));
  }
  if(!['review','receive'].includes(b.action))return json({error:'Unknown action'},400);
  const result=await createCashierReview(b,user);
  // The trusted adapter may deliver a verified statement without a /close command.
  return json(b.action==='receive'?{...result,delivery:await publishCashierReview(result.id,result.sourceHash)}:result);
 }catch(e){return json({error:e instanceof Error?e.message:'대조 처리에 실패했습니다.'},409);}
}
