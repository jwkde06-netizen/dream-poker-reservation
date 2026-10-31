import { ACCOUNT_CODES, ExchangeAccount, ExchangePlan, formatMoney, reportDates, validDate, vietnamDate } from './exchange-domain';

/** Calendar reporting only: no balance resets, transfers or automatic settlement. */
export function exchangeSettlementPeriod(epochSeconds = Math.floor(Date.now() / 1000)) {
  const today = vietnamDate(epochSeconds);
  const period = reportDates({ kind: 'report', period: 'week', from: null, to: null }, today);
  const sunday = new Date(period.from + 'T00:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { ...period, settlesOn: sunday.toISOString().slice(0, 10) };
}
function integer(value: unknown, nonnegative = false): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || (nonnegative && value < 0)) throw Error('Incomplete exchange receipt totals');
  return value;
}
/** Compact staff-facing snapshot; no account codes, internal warnings or unverified total valuation. */
export function compactExchangeStatus(report:any, tradeProfit?:number):string {
  if(report?.initialized!==true || !validDate(report.from) || !validDate(report.to)) throw Error('Exchange status unavailable');
  const b=report.balances;
  const vnd=integer(b.VND_CASH.closing_minor)+integer(b.VND_BANK.closing_minor);
  const usd=integer(b.USD_CASH.closing_minor,true)/100;
  const krw=integer(b.KRW_BANK.closing_minor,true)+integer(b.KRW_CASH?.closing_minor ?? 0,true);
  const fee=integer(report.fee_vnd),fx=integer(report.realized_fx_vnd),cost=integer(report.expense_vnd),profit=integer(report.net_known_vnd);
  if(fee+fx-cost!==profit)throw Error('Exchange totals inconsistent');
  const [fy,fm,fd]=report.from.split('-').map(Number);
  const sunday=new Date(report.from+'T00:00:00Z'); sunday.setUTCDate(sunday.getUTCDate()+6);
  const [ty,tm,td]=sunday.toISOString().slice(0,10).split('-').map(Number);
  const money=(n:number)=>n.toLocaleString('en-US');
  const lines=['📊 DREAM EXCHANGE','',`${fm}월 ${fd}일 ~ ${tm}월 ${td}일`,'','💵 현재 시제',
    `🇻🇳 VND ${money(vnd)}`,`🇺🇸 USD ${money(usd)}`,`🇰🇷 KRW ${money(krw)}`];
  if(report.total_float_vnd!==null&&report.total_float_vnd!==undefined)lines.push('', `💼 총 유통 시제 ${money(integer(report.total_float_vnd,true))}동`);
  lines.push('', `💰 이번 주 수익 ${money(profit)}동`);
  if(Array.isArray(report.memos)&&report.memos.length) lines.push('', '📝 비고', ...report.memos.map((m:any)=>`#${m.number} · ${m.body}`));
  if(tradeProfit!==undefined)lines.unshift(`✅ 기록 완료 · 이번 거래 ${money(tradeProfit)}동`,'');
  return lines.join(String.fromCharCode(10));
}
/** Use the single report RPC snapshot for BOTH all-currency balances and week-to-date profit. */
export function formatExchangeBalanceReceipt(reference: string, plan: ExchangePlan, report: any): string {
  if (!/^FX-\d+-\d+$/.test(reference) || report?.initialized !== true || !validDate(report.from) || !validDate(report.to) || typeof report.period_fully_covered !== 'boolean') throw Error('Exchange receipt snapshot is not ready');
  const period = exchangeSettlementPeriod(Math.floor(Date.parse(report.to + 'T00:00:00+07:00') / 1000));
  if (period.from !== report.from) throw Error('Exchange receipt period mismatch');
  const balances = {} as Record<ExchangeAccount, number>;
  for (const account of ACCOUNT_CODES) balances[account] = integer(report.balances?.[account]?.closing_minor ?? (account === 'KRW_CASH' ? 0 : undefined), account !== 'VND_CASH' && account !== 'VND_BANK');
  const fee = integer(report.fee_vnd), fx = integer(report.realized_fx_vnd), expense = integer(report.expense_vnd);
  const profit = integer(report.net_known_vnd);
  if (integer(fee + fx - expense) !== profit) throw Error('Exchange receipt profit mismatch');
  const unknown = integer(report.unvalued_fx_count, true), unresolved = integer(report.unresolved_count, true);
  const unknownHoldings = integer(report.unvalued_holdings, true);
  const vnd = integer(balances.VND_CASH + balances.VND_BANK);
  const earned=plan.kind==='opening'?undefined:integer(plan.fee_vnd)+(plan.fx_profit_vnd===null?0:integer(plan.fx_profit_vnd))-integer(plan.expense_vnd);
  return compactExchangeStatus(report,earned);

}
