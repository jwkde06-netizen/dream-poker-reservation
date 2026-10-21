import {norm,serial} from './accounting-plan';

export const metricLabels = {
  buyins: 'BUY IN', rake: 'RAKE', rakeBack: 'TOTAL RAKE BACK', fnb: 'F&B',
  mongol: 'MONGOL RAKE BACK', japan: 'JAPAN RAKE BACK', china: 'CHINA (AK) RAKE BACK',
  house: 'HOUSE RAKE BACK', korea2: 'KOREA2 RAKE BACK'
} as const;
export type AccountingMetric = keyof typeof metricLabels;
export type AccountingTotals = Record<AccountingMetric, number>;
export type CashierEvidence = {
  id?: string;
  date: string;
  source: 'viber' | 'cashier';
  reference: string;
  totals: Partial<AccountingTotals>;
};
export type DraftIssue = {code: string; date?: string; detail: string; reference?: string};
export type DailyComparison = {
  date: string; metric: AccountingMetric; ledger: number; cashier: number | null;
  difference: number | null; status: 'matched' | 'mismatch' | 'missing' | 'conflict'; references: string[];
};

const metrics = Object.keys(metricLabels) as AccountingMetric[];
const settlementMetrics: AccountingMetric[] = ['rakeBack','fnb','mongol','japan','china','house','korea2'];
const emptyTotals = (): AccountingTotals => ({buyins:0,rake:0,rakeBack:0,fnb:0,mongol:0,japan:0,china:0,house:0,korea2:0});

export function validateReportPeriod(startDate: string, endDate: string) {
  const start = serial(startDate), end = serial(endDate);
  if (end < start || end - start > 30) throw Error('정산 기간은 시작일부터 최대 31일까지 선택해주세요.');
  return {start, end};
}
export function sheetDate(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    const date = new Date((value - 25569) * 86400000);
    if (!Number.isFinite(date.getTime())) return null;
    const text = date.toISOString().slice(0,10);
    return /^20\d\d-/.test(text) ? text : null;
  }
  if (typeof value === 'string') {
    try { serial(value); return value; } catch { return null; }
  }
  return null;
}

export function validateCashierEvidence(value: unknown): CashierEvidence {
  const input = value as CashierEvidence;
  if (!input || !['viber','cashier'].includes(input.source)) throw Error('캐셔 또는 Viber 원본 구분이 필요합니다.');
  serial(input.date);
  if (typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 500) throw Error('대사 원본 근거가 필요합니다.');
  if (!input.totals || typeof input.totals !== 'object' || Array.isArray(input.totals)) throw Error('대사 금액이 필요합니다.');
  const totals: Partial<AccountingTotals> = {};
  for (const [key, amount] of Object.entries(input.totals)) {
    if (!metrics.includes(key as AccountingMetric) || !Number.isSafeInteger(amount) || amount < 0) throw Error('캐셔의 항목과 금액을 확인해주세요.');
    totals[key as AccountingMetric] = amount;
  }
  if (!Object.keys(totals).length) throw Error('원본에 명시된 정산 금액이 없습니다.');
  return {date:input.date,source:input.source,reference:input.reference.trim(),totals,...(input.id ? {id:String(input.id)} : {})};
}

function money(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function checkedAdd(a: number, b: number) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw Error('정산 금액이 계산 범위를 초과했습니다.');
  return result;
}

export function ledgerForPeriod(daily: unknown[][], fnb: unknown[][], startDate: string, endDate: string) {
  const {start,end} = validateReportPeriod(startDate,endDate);
  const days: Record<string, AccountingTotals> = {};
  for (let day=start; day<=end; day++) days[sheetDate(day)!] = emptyTotals();
  const issues: DraftIssue[] = [];
  const dailyHeaders = ['NUMBER','DATE','T NO.','BLIND','PLAYER','CARD NO.','AGENCY','BUY IN','RAKE','RAKE BACK','MONGOL','JAPAN','CHINA (AK)','HOUSE','KOREA2'];
  if (!dailyHeaders.every((header,index)=>daily[0]?.[index]===header)) throw Error('일일 입력 헤더가 변경되어 정산표를 확인해야 합니다.');
  if (!['DATE','FLOOR','AMOUNT','NOTE'].every((header,index)=>String(fnb[0]?.[index]||'').toUpperCase()===header)) throw Error('F&B 입력 헤더가 변경되어 정산표를 확인해야 합니다.');
  let game: unknown = null;
  const seen = new Set<string>();
  for (let i=1;i<daily.length;i++) {
    const row = daily[i];
    if (row[0] !== '' && row[0] != null) game = row[0];
    if (!row[4]) continue;
    const date = sheetDate(row[1]);
    if (!date) { issues.push({code:'undated_game',detail:`일일 입력 ${i+1}행의 날짜를 확인해주세요.`,reference:`일일 입력!A${i+1}:O${i+1}`}); continue; }
    if (!(date in days)) continue;
    const key = [date,game,row[2],row[3],norm(row[4])].join('|');
    if (seen.has(key)) issues.push({code:'duplicate_game',date,detail:`${row[4]}의 같은 게임 항목이 중복되어 있습니다. 금액은 현재 시트 합계를 유지했습니다.`,reference:`일일 입력!A${i+1}:O${i+1}`});
    seen.add(key);
    if (!game) issues.push({code:'missing_game_number',date,detail:`${row[4]}의 게임 번호가 없습니다.`,reference:`일일 입력!A${i+1}`});
    const columns: Array<[AccountingMetric,number]> = [['buyins',7],['rake',8],['rakeBack',9],['mongol',10],['japan',11],['china',12],['house',13],['korea2',14]];
    for (const [metric,column] of columns) {
      if (!money(row[column])) { issues.push({code:'invalid_formula_value',date,detail:`일일 입력 ${i+1}행 ${metricLabels[metric]} 계산값을 확인해주세요.`,reference:`일일 입력!${String.fromCharCode(65+column)}${i+1}`}); continue; }
      days[date][metric] = checkedAdd(days[date][metric], row[column] as number);
    }
  }
  for (let i=1;i<fnb.length;i++) {
    const row=fnb[i];
    if (row.every(value=>value===''||value==null)) continue;
    const date=sheetDate(row[0]);
    if (!date) { issues.push({code:'undated_fnb',detail:`F&B 입력 ${i+1}행의 날짜를 확인해주세요.`,reference:`F&B 입력!A${i+1}:D${i+1}`}); continue; }
    if (!(date in days)) continue;
    if (!money(row[2])) { issues.push({code:'invalid_fnb',date,detail:`F&B 입력 ${i+1}행의 금액을 확인해주세요.`,reference:`F&B 입력!C${i+1}`}); continue; }
    days[date].fnb=checkedAdd(days[date].fnb,row[2] as number);
  }
  const totals=emptyTotals();
  for (const day of Object.values(days)) for (const metric of metrics) totals[metric]=checkedAdd(totals[metric],day[metric]);
  return {days,totals,issues};
}

export type WeeklyDraftInput = {
  startDate: string; endDate: string; daily: unknown[][]; fnb: unknown[][];
  evidence: CashierEvidence[]; salaryAdvanceVnd: number | null;
  partnerFormulaVerified: boolean; requiredMetrics?: AccountingMetric[];
};

// Uses the existing sheet's two rounded halves plus residual. ROUND in Sheets
// rounds negative halves away from zero; Math.round alone would differ.
export function sheetRoundThousands(value: number) { return Math.sign(value)*Math.round(Math.abs(value)/1000)*1000; }

export function buildWeeklyAccountingDraft(input: WeeklyDraftInput) {
  const ledger=ledgerForPeriod(input.daily,input.fnb,input.startDate,input.endDate);
  const issues=[...ledger.issues];
  const required=input.requiredMetrics||settlementMetrics;
  if (!required.length||required.some(metric=>!metrics.includes(metric))) throw Error('대사 필수 항목 설정을 확인해주세요.');
  const sourceByDate=new Map<string,CashierEvidence[]>();
  const uniqueSources=new Set<string>();
  for (const supplied of input.evidence) {
    const evidence=validateCashierEvidence(supplied);
    if (!(evidence.date in ledger.days)) continue;
    const key=[evidence.date,evidence.reference,JSON.stringify(Object.entries(evidence.totals).sort())].join('|');
    if (uniqueSources.has(key)) continue;
    uniqueSources.add(key);
    sourceByDate.set(evidence.date,[...(sourceByDate.get(evidence.date)||[]),evidence]);
  }
  const comparison: DailyComparison[]=[];
  for (const [date,day] of Object.entries(ledger.days)) {
    const evidence=sourceByDate.get(date)||[];
    for (const metric of metrics) {
      const supplied=evidence.filter(item=>item.totals[metric]!==undefined);
      const amounts=Array.from(new Set(supplied.map(item=>item.totals[metric]!)));
      const references=Array.from(new Set(supplied.map(item=>item.reference)));
      let status: DailyComparison['status']='missing',cashier:number|null=null,difference:number|null=null;
      if (amounts.length>1) {
        status='conflict';
        issues.push({code:'conflicting_cashier_sources',date,detail:`${metricLabels[metric]} 원본 금액이 여러 개입니다. 사용할 자료를 확인해주세요.`,reference:references.join(' / ')});
      } else if (amounts.length===1) {
        cashier=amounts[0]; difference=day[metric]-cashier; status=difference===0?'matched':'mismatch';
        if (status==='mismatch') issues.push({code:'amount_mismatch',date,detail:`${metricLabels[metric]}: 입력표 ${day[metric].toLocaleString('en-US')} / 캐셔 ${cashier.toLocaleString('en-US')}`,reference:references.join(' / ')});
      } else if (required.includes(metric)) {
        issues.push({code:'missing_cashier_metric',date,detail:`${metricLabels[metric]} 캐셔 원본이 없습니다.`});
      }
      comparison.push({date,metric,ledger:day[metric],cashier,difference,status,references});
    }
  }
  if (input.salaryAdvanceVnd!==null&&!money(input.salaryAdvanceVnd)) throw Error('직원 급여 선지출은 0 이상의 정수 금액으로 확인해주세요.');
  if (input.salaryAdvanceVnd===null) issues.push({code:'salary_unconfirmed',detail:'베트남 직원 급여 선지출을 확인해주세요. 없으면 0으로 명시해주세요.'});
  if (!input.partnerFormulaVerified) issues.push({code:'partner_formula_changed',detail:'기존 주간 정산표의 파트너 배분 수식이 변경되어 확인이 필요합니다.'});
  const knownExpenses=settlementMetrics.filter(metric=>metric!=='rakeBack').reduce((sum,metric)=>checkedAdd(sum,ledger.totals[metric]),0);
  const totalExpense=input.salaryAdvanceVnd===null||ledger.issues.length>0?null:checkedAdd(knownExpenses,input.salaryAdvanceVnd);
  const netProfit=totalExpense===null?null:ledger.totals.rakeBack-totalExpense;
  const half=netProfit===null?null:sheetRoundThousands(netProfit/2);
  const partnerShares=input.partnerFormulaVerified&&half!==null&&netProfit!==null?[
    {label:'PARTNER 1',amountVnd:half},{label:'PARTNER 2',amountVnd:half},{label:'PARTNER 3',amountVnd:netProfit-2*half}
  ]:null;
  return {
    kind:'weekly_accounting_draft' as const,
    status:issues.length?'needs_review' as const:'ready_for_review' as const,
    recipient:'김지영 대표',sendAllowed:false as const,currency:'VND',timeZone:'Asia/Ho_Chi_Minh',
    period:{startDate:input.startDate,endDate:input.endDate},
    requiredMetrics:required,
    totals:ledger.totals,salaryAdvanceVnd:input.salaryAdvanceVnd,totalExpense,netProfit,partnerShares,
    comparison,issues,sourceReferences:Array.from(new Set(input.evidence.filter(item=>item.date in ledger.days).map(item=>item.reference))),
    calculationBasis:'기존 주간 정산표: TOTAL RAKE BACK - F&B - 에이전시 지급액 - 베트남 직원 급여 선지출. PARTNER 1/2 = ROUND(NET/2,-3), PARTNER 3 = 잔액.',
    ledgerValuesComplete:ledger.issues.length===0
  };
}
export type WeeklyAccountingDraft=ReturnType<typeof buildWeeklyAccountingDraft>;

export function weeklyDraftRows(draft: WeeklyAccountingDraft): Array<Array<string|number>> {
  const value=(amount:number|null)=>amount===null?'확인 필요':amount;
  return [
    ['DREAM POKER 주간 정산 초안'],['기간',draft.period.startDate,draft.period.endDate],
    ['수신 예정',draft.recipient,'미전송'],['상태',draft.status==='ready_for_review'?'검토용 초안':'확인 필요'],[],
    ['필수 대사 항목',draft.requiredMetrics.map(metric=>metricLabels[metric]).join(' / ')],
    ['항목','금액 (VND)'],['TOTAL RAKE BACK',draft.totals.rakeBack],['F&B',draft.totals.fnb],
    ...(['mongol','japan','china','house','korea2'] as AccountingMetric[]).map(metric=>[metricLabels[metric],draft.totals[metric]]),
    ['베트남 직원 급여 선지출',value(draft.salaryAdvanceVnd)],['TOTAL EXPENSE',value(draft.totalExpense)],['NET PROFIT / LOSS',value(draft.netProfit)],
    [],['SHARE','AMOUNT'],...(draft.partnerShares?.map(item=>[item.label,item.amountVnd])||[['파트너 배분','확인 필요']]),[],
    ['일자','항목','입력표','캐셔 / Viber','차이','대사 상태','원본 근거','필수 여부'],
    ...draft.comparison.map(row=>[row.date,metricLabels[row.metric],row.ledger,value(row.cashier),value(row.difference),({matched:'일치',mismatch:'불일치',missing:'원본 없음',conflict:'원본 충돌'} as const)[row.status],row.references.join(' / '),draft.requiredMetrics.includes(row.metric)?'필수':'참고']),
    [],['확인 사항','일자','내용','근거'],...draft.issues.map(issue=>[issue.code,issue.date||'',issue.detail,issue.reference||'']),
    [],['계산 기준',draft.calculationBasis],['검증','원본 누락 및 불일치는 확인 사항에 표시합니다. 초안 생성은 전송을 의미하지 않습니다.']
  ];
}
export function weeklyDraftCsv(draft: WeeklyAccountingDraft) {
  return '\uFEFF'+weeklyDraftRows(draft).map(row=>row.map(value=>{
    const raw=String(value);
    const safe=typeof value==='string'&&/^\s*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+safe.replace(/"/g,'""')+'"';
  }).join(',')).join('\r\n');
}

export function parseWeeklyRequest(text: string, businessDate: string) {
  if (!/^(?:\/weekly(?:@\w+)?|주간\s*정산|(?:이번\s*주|지난\s*주)\s*정산)/i.test(text.trim())) return null;
  const dates=text.match(/20\d\d-\d\d-\d\d/g);
  if (dates?.length===2) { validateReportPeriod(dates[0],dates[1]); return {startDate:dates[0],endDate:dates[1]}; }
  if (/(이번\s*주|지난\s*주)/.test(text)) {
    const day=serial(businessDate),weekday=new Date((day-25569)*86400000).getUTCDay();
    const monday=day-((weekday+6)%7)-(/지난\s*주/.test(text)?7:0);
    return {startDate:sheetDate(monday)!,endDate:sheetDate(monday+6)!};
  }
  throw Error('정산 기간을 알려주세요. 예: 주간 정산 2026-10-12 ~ 2026-10-18');
}
