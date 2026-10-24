import {createHash} from 'node:crypto';
import {requireAdmin} from '../../../../lib/telegram';
import {db,ranges,extract,readChipColumns} from '../../../../lib/accounting-agent';
import {sheetContext} from '../../../../lib/accounting-context';
import {serial} from '../../../../lib/accounting-plan';
import {scanImage,scanReview} from '../../../../lib/desk-scan-review';
export const dynamic='force-dynamic';export const maxDuration=120;
const json=(body:any,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){
 const user=await requireAdmin(req);if(!user)return json({error:'관리자 로그인이 필요해요.'},403);
 try{
  if(Number(req.headers.get('content-length')||0)>3600000)return json({error:'사진 용량이 너무 큽니다.'},413);
  const raw=await req.text();if(raw.length>3600000)return json({error:'사진 용량이 너무 큽니다.'},413);
  const body=JSON.parse(raw);serial(body.day);const bytes=scanImage(body.image);
  const [[daily,master],rules]=await Promise.all([ranges(["'일일 입력'!A1:O5000","'플레이어 명단'!A1:D2500"],true),db().from('dream_accounting_rules').select('id,kind,content').eq('active',true).order('id')]);
  if(rules.error)throw Error('업무 규칙을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
  const [result,evidence]=await Promise.all([extract('웹에서 촬영한 바이인 시트의 읽기 전용 판독입니다. 모든 대상 플레이어와 누적 바인을 추출해주세요. 기존 기록과 같아도 추출하세요. 실제 게임 선택과 저장은 관리자가 화면에서 확인합니다.',body.image,{...sheetContext(daily,master,body.day),businessRules:rules.data}),readChipColumns(body.image)]).catch(()=>{throw Error('사진 판독에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');});
  return json({...scanReview(result,evidence,master,rules.data||[],body.day),scanHash:createHash('sha256').update(bytes).digest('hex')});
 }catch(e){return json({error:(e as Error).message||'사진을 읽지 못했습니다. 다시 시도해주세요.'},400);}
}
