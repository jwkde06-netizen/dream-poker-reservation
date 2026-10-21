import {accessToken} from './accounting-google';
import {settlementProfile as profile} from './settlement-profile';
import {buildSettlement,weekOf} from './settlement-domain';
import {createClient} from '@supabase/supabase-js';
import {projectUrl} from './telegram';
import {jobReport} from './accounting-workflow';
export const settlementDb=()=>createClient(projectUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
export async function loadSettlement(day:string,salary:number|null){
 const week=weekOf(day),token=await accessToken(),headers={Authorization:'Bearer '+token};
 const root=`https://sheets.googleapis.com/v4/spreadsheets/${profile.workbook}`;
 const meta=await fetch(root+'?fields=sheets(properties(title,gridProperties(rowCount)))',{headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!meta.ok)throw Error('시트 연결을 확인해주세요.');const info=await meta.json();
 const sizes=new Map<string,number>(info.sheets.map((s:any)=>[s.properties.title,s.properties.gridProperties.rowCount]));
 const ranges=[profile.tabs.daily,profile.tabs.fnb].map((tab,i)=>{
  const rows=sizes.get(tab);if(!rows||rows>20000)throw Error('시트 크기 또는 연결 설정을 확인해주세요.');return "'"+tab.replace(/'/g,"''")+"'!A1:"+(i?'D':'O')+rows;
 });ranges.push("'"+profile.tabs.weekly+"'!A1:B21");
 const p=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});ranges.forEach(r=>p.append('ranges',r));
 const response=await fetch(root+'/values:batchGet?'+p,{headers,cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('정산 자료를 불러오지 못했어요.');const data=await response.json();
 const client=settlementDb(),jobs:any[]=[];
 // Bounded pages, never silently omit an unresolved job due to API row limits.
 for(let offset=0;offset<10000;offset+=500){
  const q=await client.from('dream_accounting_jobs').select('message_id,text,status,plan,reply_text,reply_id,created_at').gte('created_at',week.start+'T00:00:00+07:00').lte('created_at',week.end+'T23:59:59.999+07:00').order('update_id').range(offset,offset+499);
  if(q.error)throw Error('처리 이력을 불러오지 못했어요.');jobs.push(...q.data||[]);if((q.data?.length||0)<500)break;if(offset===9500)throw Error('처리 이력이 너무 많아요. 관리자 점검이 필요해요.');
 }
 const pending=jobReport(jobs).pending;
 const r=buildSettlement(day,data.valueRanges?.[0]?.values||[],data.valueRanges?.[1]?.values||[],data.valueRanges?.[2]?.values||[],salary,pending);
 const saved=await client.from('dream_weekly_reports').select('id,status,source_hash,created_at,created_by,snapshot').eq('room_id',profile.id).eq('week_start',week.start).order('created_at',{ascending:false}).limit(20);
 if(saved.error)throw Error('정산 저장소를 불러오지 못했어요.');
 return {...r,history:(saved.data||[]).map(x=>{
  // Compare against the saved report's manager-entered adjustment, not the
  // current form's default. A blank form must not falsely invalidate a report.
  const savedSalary=x.snapshot?.salarySource==='sheet'&&r.sameWeek?null:(x.snapshot?.salary??null);
  const current=buildSettlement(day,data.valueRanges?.[0]?.values||[],data.valueRanges?.[1]?.values||[],data.valueRanges?.[2]?.values||[],savedSalary,pending);
  return {id:x.id,status:x.status,createdAt:x.created_at,createdBy:x.created_by,changed:x.source_hash!==current.sourceHash,salary:x.snapshot?.salary??null};
 }),sheetUrl:`https://docs.google.com/spreadsheets/d/${profile.workbook}/edit`,sheetIds:profile.sheetIds};
}
