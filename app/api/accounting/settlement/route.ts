import {NextResponse} from 'next/server';
import {requireAdmin} from '../../../../lib/telegram';
import {loadSettlement,settlementDb} from '../../../../lib/settlement-service';
import {localToday,reportText} from '../../../../lib/settlement-domain';
import {getVercelOidcToken} from '@vercel/oidc';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=120;
const json=(b:any,status=200)=>NextResponse.json(b,{status,headers:{'Cache-Control':'no-store'}});
function parseSalary(v:any){if(v===null||v===undefined||v==='')return null;const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('급여 선지출 금액을 확인해주세요.');return n;}
export async function GET(request:Request){
 if(!await requireAdmin(request))return json({error:'관리자 계정으로 로그인해주세요.'},403);
 try{const p=new URL(request.url).searchParams;
  if(p.has('id')){const id=p.get('id');if(!/^[a-f0-9-]{36}$/.test(id||''))return json({error:'저장 이력을 확인해주세요.'},400);
   const r=await settlementDb().from('dream_weekly_reports').select('id,status,created_at,created_by,report_text').eq('room_id','dream').eq('id',id).single();
   if(r.error)return json({error:'저장 이력을 찾지 못했어요.'},404);return json(r.data);
  }
  return json(await loadSettlement(p.get('day')||localToday(),parseSalary(p.get('salary'))));}
 catch(e){return json({error:e instanceof Error?e.message:'자료를 불러오지 못했어요.'},400);}
}
export async function POST(request:Request){
 const user=await requireAdmin(request);if(!user)return json({error:'관리자 계정으로 로그인해주세요.'},403);
 try{
  const b=await request.json();if(!['draft','confirm','summary'].includes(b.action)||typeof b.day!=='string'||typeof b.sourceHash!=='string')return json({error:'요청을 확인해주세요.'},400);
  const report=await loadSettlement(b.day,parseSalary(b.salary));
  if(report.sourceHash!==b.sourceHash)return json({error:'원본 또는 처리 이력이 변경됐어요. 새로고침 후 다시 검토해주세요.'},409);
  if(b.action==='summary'){
   // Only aggregate facts reach AI. It cannot write cells, finalize or change totals.
   const facts={start:report.start,end:report.end,closed:report.closed,totals:report.totals,salary:report.salary,expense:report.expense,net:report.net,days:report.days,issueCount:report.issues.length};
   const r=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+(process.env.AI_GATEWAY_API_KEY||await getVercelOidcToken()),'Content-Type':'application/json'},body:JSON.stringify({model:process.env.AI_GATEWAY_MODEL||'openai/gpt-5-mini',reasoning_effort:'low',max_tokens:1000,messages:[{role:'system',content:'한국어 주간정산 보고서 초안을 4문장 이내로 작성한다. 제공된 집계 사실만 설명한다. 지급 완료, 확정, 원인, 전주 대비 증감을 추측하지 않는다. salary가 null이면 급여 미확인 및 잠정 잔액임을 명시한다. closed=false면 주간 진행 중임을 명시한다. issueCount가 양수면 검토 필요를 알린다. back은 총 레이크백이며 net은 본 집계의 정산 잔액이다. 지출 전체가 포함된 순이익이라고 부르지 않는다.'},{role:'user',content:JSON.stringify(facts)}]}),signal:AbortSignal.timeout(60000),cache:'no-store'});
   if(!r.ok)return json({error:'AI 설명을 만들지 못했어요. 집계 보고서는 그대로 사용할 수 있어요.'},503);
   const result=await r.json(),text=result.choices?.[0]?.message?.content;if(typeof text!=='string'||text.length>6000)throw Error('AI 응답을 확인하지 못했어요.');return json({summary:text,sourceHash:report.sourceHash});
  }
  if(b.action==='confirm'&&(!report.canConfirm||b.reviewed!==true))return json({error:'주간 종료 후 확인 필요 항목을 해결하고 검토 체크를 해주세요.'},409);
  const status=b.action==='confirm'?'confirmed':'draft';
  const {history,...snapshot}=report;
  const saved=await settlementDb().from('dream_weekly_reports').insert({room_id:report.roomId,week_start:report.start,week_end:report.end,status,source_hash:report.sourceHash,snapshot,report_text:status==='confirmed'?reportText(report).replace('주간정산 초안','주간정산 확정'):reportText(report),created_by:user.id}).select('id,status,created_at').single();
  if(saved.error){if(saved.error.code==='23505')return json({message:'같은 내용으로 이미 저장돼 있어요.'});throw Error('저장하지 못했어요. 다시 시도해주세요.');}
  return json({message:status==='confirmed'?'주간정산을 확정했어요.':'검토용 초안을 저장했어요.',report:saved.data});
 }catch(e){return json({error:e instanceof Error?e.message:'요청을 처리하지 못했어요.'},400);}
}
