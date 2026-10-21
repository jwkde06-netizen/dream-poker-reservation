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
/** Use the single report RPC snapshot for BOTH all-currency balances and week-to-date profit. */
export function formatExchangeBalanceReceipt(reference: string, plan: ExchangePlan, report: any): string {
  if (!/^FX-\d+-\d+$/.test(reference) || report?.initialized !== true || !validDate(report.from) || !validDate(report.to) || typeof report.period_fully_covered !== 'boolean') throw Error('Exchange receipt snapshot is not ready');
  const period = exchangeSettlementPeriod(Math.floor(Date.parse(report.to + 'T00:00:00+07:00') / 1000));
  if (period.from !== report.from) throw Error('Exchange receipt period mismatch');
  const balances = {} as Record<ExchangeAccount, number>;
  for (const account of ACCOUNT_CODES) balances[account] = integer(report.balances?.[account]?.closing_minor, true);
  const fee = integer(report.fee_vnd), fx = integer(report.realized_fx_vnd), expense = integer(report.expense_vnd);
  const profit = integer(report.net_known_vnd);
  if (integer(fee + fx - expense) !== profit) throw Error('Exchange receipt profit mismatch');
  const unknown = integer(report.unvalued_fx_count, true), unresolved = integer(report.unresolved_count, true);
  const unknownHoldings = integer(report.unvalued_holdings, true);
  const vnd = integer(balances.VND_CASH + balances.VND_BANK, true);
  const lines = [
    '완료 ✅',
    `베트남동 시제: ${formatMoney(vnd, 'VND_CASH')}`,
    `  현금 ${formatMoney(balances.VND_CASH, 'VND_CASH')} · 계좌 ${formatMoney(balances.VND_BANK, 'VND_BANK')}`,
    `USD 시제: ${formatMoney(balances.USD_CASH, 'USD_CASH')}`,
    `원화 시제: ${formatMoney(balances.KRW_BANK, 'KRW_BANK')}`,
    '',
  ];
  if (plan.kind !== 'opening') {
    const known = integer(integer(plan.fee_vnd) + (plan.fx_profit_vnd === null ? 0 : integer(plan.fx_profit_vnd)) - integer(plan.expense_vnd));
    lines.push(`이번 거래 ${plan.fx_profit_vnd === null ? '확인된 수익' : '수익'}: ${formatMoney(known, 'VND_CASH')}${plan.fx_profit_vnd === null ? ' (환차익 미확정)' : ''}`);
  }
  const partial = !report.period_fully_covered || unknown > 0 || unresolved > 0;
  lines.push(
    `이번 주 ${partial ? '확인된 누적 수익' : '누적 수익'}: ${formatMoney(profit, 'VND_CASH')}`,
    `수수료 ${formatMoney(fee, 'VND_CASH')} + 실현환차익 ${formatMoney(fx, 'VND_CASH')} − 비용 ${formatMoney(expense, 'VND_CASH')}`,
    `집계: ${report.from} ~ ${report.to} (베트남 기준)`,
    `시제 보관: 지원 · ${period.settlesOn}(일) Danny 정산`,
  );
  if (partial) lines.push('※ ' + [!report.period_fully_covered ? '기록 시작 이전 제외' : '', unknown ? `원가 미확인 처분 ${unknown}건` : '', unresolved ? `미해결 입력 ${unresolved}건` : ''].filter(Boolean).join(' · ') + '. 전체 확정 수익이 아닙니다.');
  if (unknownHoldings) lines.push(`※ 보유 외화 원가 미확인 ${unknownHoldings}개. 미실현 평가이익은 수익에 포함하지 않습니다.`);
  lines.push('일요일 도래만으로 정산 완료·시제 차감하지 않습니다.', `거래번호: ${reference}`);
  return lines.join('\n');
}
