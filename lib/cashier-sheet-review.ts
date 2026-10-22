import {summarizeDay} from './accounting-report-summary';
import {compareCashier,discrepancyText,Entry,Statement} from './cashier-reconciliation';

/** Build a read-only review from one consistent, unformatted A:I snapshot.
 * This function never marks a day closed or sends a message.
 * Evidence flags must come from a verified source adapter, not the OCR model.
 */
export function reviewCashierAgainstSheet(
 statement:Statement,
 rows:any[][],
 evidence:{allPagesVerified:boolean;codeScopeVerified:boolean;amountBasisVerified:boolean},
 options:Parameters<typeof compareCashier>[3]={}
){
 const summary=summarizeDay(rows,statement.date);
 const serial=Date.parse(statement.date+'T00:00:00Z')/86400000+25569;
 const entries:Entry[]=[];
 let game=0,priorDay:any=null;
 for(const row of rows.slice(1)){
  if(row[1]!==priorDay){game=0;priorDay=row[1];}
  if(row[0]!==''&&row[0]!=null)game=Number(row[0]);
  if(Number(row[1])!==serial||!row[4])continue;
  entries.push({game,table:String(row[2]),player:String(row[4]),buyins:Number(row[7]),amount:Number(row[8])});
 }
 const result=compareCashier(statement,entries,statement.date,options);
 if(evidence.allPagesVerified!==true)result.issues.push('캐셔 정산서 전체 페이지 확인이 필요합니다.');
 if(evidence.codeScopeVerified!==true)result.issues.push('캐셔 정산서와 우리 시트의 대상 코드 확인이 필요합니다.');
 if(evidence.amountBasisVerified!==true)result.issues.push('캐셔 금액과 일일 입력 I열의 금액 기준 확인이 필요합니다.');
 result.matched=result.matched&&result.issues.length===0;
 return {result,summary,readyToReport:result.matched,text:result.matched?summary.text:discrepancyText(result)};
}
