import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {requireAdmin} from '../../../../lib/telegram';
import {db,ranges,sheet,same} from '../../../../lib/accounting-agent';
import {deskPlan,sourceHash,LedgerSource} from '../../../../lib/desk-ledger-plan';
import {ledgerView,assertReservationOperation} from '../../../../lib/desk-ledger-view';
import {prepareDateFormats,verifyDateDisplays} from '../../../../lib/accounting-format';
export const dynamic='force-dynamic';export const maxDuration=120;
const json=(x:any,status=200)=>NextResponse.json(x,{status,headers:{'Cache-Control':'no-store'}});
async function read():Promise<LedgerSource>{const [daily,fnb,master,menu]=await ranges(["'일일 입력'!A1:O5000","'F&B 입력'!A1:D2000","'플레이어 명단'!A1:D2500","'F&B 가격표'!A1:E100"],true);return {daily,fnb,master,menu};}
async function checkReservation(operation:any){
 if(!operation?.reservationId)return;
 if(!/^[-a-f0-9]{36}$/i.test(operation.reservationId))throw Error('예약을 다시 선택해주세요.');
 const client=db();
 const r=await client.from('reservations').select('id,status,version,player_name,player_name_en,is_test').eq('id',operation.reservationId).single();
 if(r.error)throw Error('예약을 확인하지 못했어요.');
 assertReservationOperation(operation,r.data);
 const used=await client.from('dream_desk_commands').select('id').contains('operation',{reservationId:operation.reservationId}).in('status',['applied','writing']).limit(1);
 if(used.error)throw Error('예약 연결 이력을 확인하지 못했어요.');
 if(used.data?.length)throw Error('이미 장부에 연결했거나 저장 확인 중인 예약입니다. 선수 기록을 확인해주세요.');
}
export async function GET(req:Request){
 const user=await requireAdmin(req);if(!user)return json({error:'관리자 로그인이 필요해요.'},403);
 try{
 const day=new URL(req.url).searchParams.get('day')||new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 const s=await read(),view=ledgerView(s,day),client=db();
 const q=await client.from('dream_desk_commands').select('id,status,summary,created_at,completed_at').eq('created_by',user.id).order('created_at',{ascending:false}).limit(20);
 if(q.error)throw Error('처리 이력을 불러오지 못했어요.');
 const from=new Date(day+'T00:00:00+07:00'),to=new Date(from.getTime()+86400000);
 const reservations=await client.from('reservations').select('id,game_id,player_name,player_name_en,player_name_ko,status,version,arrival_at,game:reservation_games(title,table_no,game_no,is_default_queue)').eq('is_test',false).gte('arrival_at',from.toISOString()).lt('arrival_at',to.toISOString()).order('arrival_at',{ascending:true}).limit(501);
 if(reservations.error)throw Error('예약 내역을 불러오지 못했어요.');
 if(reservations.data.length>500)throw Error('하루 예약이 500건을 초과하여 전체 대조가 필요합니다.');
 return json({...view,reservations:reservations.data,checkedAt:new Date().toISOString(),players:s.master.slice(1).filter(r=>r[0]).map(r=>({name:r[0],card:r[1]||'',agency:r[2]||''})),menu:s.menu.slice(1).filter(r=>r[0]).map(r=>({name:r[0],price:r[2],unit:r[3]})),history:q.data,sourceHash:sourceHash(s)});
 }catch(e){return json({error:(e as Error).message},400);}
}
export async function POST(req:Request){
 const user=await requireAdmin(req);if(!user)return json({error:'관리자 로그인이 필요해요.'},403);
 const client=db();let locked=false,writing=false,owner=randomUUID();
 try{const raw=await req.text();if(raw.length>15000)return json({error:'요청이 너무 길어요.'},413);const b=JSON.parse(raw);
  if(b.action==='preview'){
   const s=await read();if(b.sourceHash!==sourceHash(s))return json({error:'원본이 변경됐어요. 새로고침 후 다시 작성해주세요.'},409);
   await checkReservation(b.operation);
   const plan=deskPlan(b.operation,s);if(!plan.changes.length)return json({noop:true,summary:plan.summary});
   const result=await client.from('dream_desk_commands').insert({created_by:user.id,status:'preview',source_hash:sourceHash(s),operation:b.operation,changes:plan.changes,summary:plan.summary}).select('id,summary').single();if(result.error)throw Error('변경안을 저장하지 못했어요.');return json(result.data);
  }
  if(!['apply','reconcile'].includes(b.action)||!/^[-a-f0-9]{36}$/.test(b.id||''))return json({error:'요청을 확인해주세요.'},400);
  const saved=await client.from('dream_desk_commands').select('*').eq('id',b.id).eq('created_by',user.id).single();if(saved.error)throw Error('변경안을 찾지 못했어요.');const plan=saved.data;
  if(plan.status==='applied')return json({applied:true,summary:plan.summary});
  if(b.action==='reconcile'){
   if(Date.now()-Date.parse(plan.writing_started_at||plan.created_at)<150000)return json({error:'저장 확인 중입니다. 3분 뒤 다시 확인해주세요.'},409);
   if(plan.status!=='writing'||!plan.lock_owner)return json({error:'확인이 필요한 저장 건이 아닙니다.'},409);
   const mutex=await client.from('dream_accounting_mutex').select('owner').eq('id',true).single();if(mutex.error||mutex.data?.owner!==plan.lock_owner)return json({error:'작업 잠금 상태를 확인해주세요.'},409);
   const actual=await ranges(plan.changes.map((c:any)=>c.range));const applied=plan.changes.every((c:any,i:number)=>same(actual[i],c.values));const unchanged=plan.changes.every((c:any,i:number)=>same(actual[i],c.before));
   if(!applied&&!unchanged)return json({error:'일부 값이 달라 자동 확정할 수 없어요. 원본과 변경안을 대조해주세요.'},409);
   if(applied)await verifyDateDisplays(plan.changes,sheet);
   const result=await client.from('dream_desk_commands').update({status:applied?'applied':'failed',completed_at:new Date().toISOString()}).eq('id',plan.id);if(result.error)throw Error('확인 이력을 저장하지 못했어요.');
   await client.rpc('dream_accounting_release',{p_owner:plan.lock_owner});return json({applied,summary:[applied?'시트 반영을 확인했습니다.':'원본 변경이 없어 저장되지 않은 것으로 확인했습니다.']});
  }
  if(plan.status!=='preview')return json({error:'이미 처리 중이거나 확인이 필요한 요청이에요.'},409);
  if(Date.now()-Date.parse(plan.created_at)>600000)return json({error:'변경안이 만료됐어요. 다시 확인해주세요.'},409);
  const lock=await client.rpc('dream_accounting_acquire',{p_owner:owner});if(lock.error||!lock.data)return json({error:'다른 입력을 처리 중이에요. 잠시 후 저장해주세요.'},409);locked=true;
  const fresh=await read();if(sourceHash(fresh)!==plan.source_hash)return json({error:'직원이 원본을 수정했어요. 새로고침 후 변경안을 다시 확인해주세요.'},409);
  await checkReservation(plan.operation);
  const current=await ranges(plan.changes.map((c:any)=>c.range));if(!plan.changes.every((c:any,i:number)=>same(current[i],c.before)))return json({error:'원본 값이 변경됐어요. 다시 확인해주세요.'},409);
  const claimed=await client.from('dream_desk_commands').update({status:'writing',lock_owner:owner,writing_started_at:new Date().toISOString()}).eq('id',plan.id).eq('status','preview').select('id').single();if(claimed.error)throw Error('이미 처리 중인 요청입니다.');writing=true;
  await prepareDateFormats(plan.changes,sheet);
  await sheet('values:batchUpdate',{valueInputOption:'RAW',data:plan.changes.map((c:any)=>({range:c.range,values:c.values}))});
  const actual=await ranges(plan.changes.map((c:any)=>c.range));if(!plan.changes.every((c:any,i:number)=>same(actual[i],c.values)))throw Error('저장 결과를 확인해야 합니다. 중복 저장하지 마세요.');
  await verifyDateDisplays(plan.changes,sheet);
  const completed=await client.from('dream_desk_commands').update({status:'applied',completed_at:new Date().toISOString()}).eq('id',plan.id);if(completed.error)throw Error('저장 이력 확인이 필요합니다.');writing=false;
  return json({applied:true,summary:plan.summary});
 }catch(e){return json({error:writing?'저장 결과 확인이 필요합니다. 다시 입력하지 말고 관리자에게 알려주세요.':(e as Error).message},400);}
 finally{if(locked&&!writing)await client.rpc('dream_accounting_release',{p_owner:owner});}
}
