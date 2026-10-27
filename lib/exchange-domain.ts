/** Pure money rules. AI may extract fields; it never calculates or posts balances. */
export const EXCHANGE_ACCOUNTS = {
  VND_CASH: { currency: 'VND', scale: 1, label: '동 현금' },
  VND_BANK: { currency: 'VND', scale: 1, label: '베트남 계좌' },
  KRW_BANK: { currency: 'KRW', scale: 1, label: '원화 계좌' },
  KRW_CASH: { currency: 'KRW', scale: 1, label: '원화 현금' },
  USD_CASH: { currency: 'USD', scale: 100, label: '달러 현금' },
} as const;
export type ExchangeAccount = keyof typeof EXCHANGE_ACCOUNTS;
export const ACCOUNT_CODES = Object.keys(EXCHANGE_ACCOUNTS) as ExchangeAccount[];
export const DEFAULT_EXCHANGE_RATES = { KRW: '18', USD: '25000' } as const;
const MAX_MONEY = 9_000_000_000_000;

export class ExchangeReview extends Error {
  constructor(message: string) { super(message); this.name = 'ExchangeReview'; }
}
export interface ExchangeBalance { balance_minor: number; book_vnd: number | null }
export interface ExchangeState {
  initialized: boolean;
  version: number;
  opened_at: string | null;
  accounts: Record<ExchangeAccount, ExchangeBalance>;
}
export interface ExchangeLeg { account: ExchangeAccount; amount: string }
export type ExchangeIntent =
  | { kind: 'opening'; balances: Record<ExchangeAccount, string>; basis_vnd: Partial<Record<'KRW_BANK' | 'KRW_CASH' | 'USD_CASH', string | null>>; note: string }
  | { kind: 'exchange'; received: ExchangeLeg; paid: { account: ExchangeAccount; amount: string | null }; fee: { account: 'VND_CASH' | 'VND_BANK'; amount: string } | null; received_includes_fee: boolean; rate_vnd: string | null; note: string; external_reference: string | null }
  | { kind: 'movement'; account: ExchangeAccount; amount: string; direction: 'in' | 'out'; category: 'capital' | 'expense' | 'fee' | 'fx_profit'; basis_vnd: string | null; note: string; external_reference: string | null }
  | { kind: 'reversal'; reference: string; note: string }
  | { kind: 'report'; period: 'today' | 'week' | 'last_week' | 'range'; from: string | null; to: string | null }
  | { kind: 'balance' }
  | { kind: 'help' }
  | { kind: 'ignore' };

export interface ExchangePosting {
  account: ExchangeAccount;
  amount_minor: number;
  book_delta_vnd: number | null;
  /** Required optimistic snapshot, checked again under the DB lock. */
  before_minor: number;
  before_book_vnd: number | null;
  after_minor: number;
  after_book_vnd: number | null;
}
export interface ExchangeJournalLine { account: ExchangeAccount | 'OPENING_EQUITY' | 'CAPITAL_EQUITY' | 'FEE_REVENUE' | 'FX_REVENUE' | 'OPERATING_EXPENSE'; debit_vnd: number | null }
export interface ExchangePlan {
  kind: 'opening' | 'exchange' | 'movement' | 'reversal';
  version: number;
  postings: ExchangePosting[];
  journal: ExchangeJournalLine[];
  fee_vnd: number;
  fx_profit_vnd: number | null;
  expense_vnd: number;
  capital_vnd: number | null;
  valuation_incomplete: boolean;
  external_reference: string | null;
  reverses_reference: string | null;
  note: string;
  rate_used: string | null;
  summary: string[];
}
export interface ExchangeEvent { reference: string; plan: ExchangePlan; created_at?: string }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ExchangeReview('거래 항목을 다시 확인해주세요.');
  return value as Record<string, unknown>;
}
function account(value: unknown): ExchangeAccount {
  if (typeof value !== 'string' || !ACCOUNT_CODES.includes(value as ExchangeAccount)) throw new ExchangeReview('어느 시제인지 알려주세요: 동 현금 / 베트남 계좌 / 원화 계좌 / 원화 현금 / 달러 현금.');
  return value as ExchangeAccount;
}
function short(value: unknown, max = 500): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new ExchangeReview('메모가 너무 길거나 올바르지 않습니다.');
  return value.trim();
}
function amountText(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(value)) throw new ExchangeReview('통화와 정확한 금액을 알려주세요. 숫자 없는 금액이나 추정 금액은 기록하지 않습니다.');
  return value;
}
function reference(value: unknown): string | null {
  const text = short(value, 100);
  if (!text) return null;
  if (/[\u0000-\u001f<>]/.test(text)) throw new ExchangeReview('거래번호를 문자·숫자로 다시 알려주세요.');
  return text;
}
function leg(value: unknown): ExchangeLeg { const x = object(value); return { account: account(x.account), amount: amountText(x.amount) }; }

/** Runtime whitelist: never trust a model's TypeScript-shaped JSON. Amounts are ordinary currency units. */
export function validateExchangeIntent(value: unknown): ExchangeIntent {
  const x = object(value);
  switch (x.kind) {
    case 'opening': {
      const balances = object(x.balances), basis = x.basis_vnd == null ? {} : object(x.basis_vnd);
      const result = {} as Record<ExchangeAccount, string>;
      for (const code of ACCOUNT_CODES) result[code] = code === 'KRW_CASH' && balances[code] == null ? '0' : amountText(balances[code]);
      const basisResult: Partial<Record<'KRW_BANK' | 'KRW_CASH' | 'USD_CASH', string | null>> = {};
      for (const code of ['KRW_BANK', 'KRW_CASH', 'USD_CASH'] as const) basisResult[code] = basis[code] == null ? null : amountText(basis[code]);
      return { kind: 'opening', balances: result, basis_vnd: basisResult, note: short(x.note) };
    }
    case 'exchange': {
      const p = object(x.paid);
      let fee: Extract<ExchangeIntent, { kind: 'exchange' }>['fee'] = null;
      if (x.fee != null) {
        const f = leg(x.fee);
        if (f.account !== 'VND_CASH' && f.account !== 'VND_BANK') throw new ExchangeReview('수수료는 동 현금 또는 베트남 계좌의 실제 수령액으로 알려주세요.');
        fee = { account: f.account, amount: f.amount };
        if (typeof x.received_includes_fee !== 'boolean') throw new ExchangeReview('받은 금액에 수수료가 포함되어 있나요, 별도로 더 받았나요?');
      }
      return { kind: 'exchange', received: leg(x.received), paid: { account: account(p.account), amount: p.amount == null ? null : amountText(p.amount) }, fee, received_includes_fee: x.received_includes_fee === true, rate_vnd: x.rate_vnd == null ? null : amountText(x.rate_vnd), note: short(x.note), external_reference: reference(x.external_reference) };
    }
    case 'movement': {
      if (!['in', 'out'].includes(String(x.direction)) || !['capital', 'expense', 'fee', 'fx_profit'].includes(String(x.category))) throw new ExchangeReview('입금/출금 방향과 분류(시제 보충·회수 / 비용 / 수수료 / 환전수익)를 알려주세요.');
      const note = short(x.note);
      if (!note) throw new ExchangeReview('이 입출금의 목적을 알려주세요.');
      return { kind: 'movement', account: account(x.account), amount: amountText(x.amount), direction: x.direction as 'in' | 'out', category: x.category as 'capital' | 'expense' | 'fee' | 'fx_profit', basis_vnd: x.basis_vnd == null ? null : amountText(x.basis_vnd), note, external_reference: reference(x.external_reference) };
    }
    case 'reversal': {
      const ref = reference(x.reference), note = short(x.note);
      if (!ref || !/^FX-[0-9]+-[0-9]+$/.test(ref) || !note) throw new ExchangeReview('취소할 FX 거래번호와 사유를 알려주세요. 예: FX-123-456 취소, 금액 오입력.');
      return { kind: 'reversal', reference: ref, note };
    }
    case 'report': {
      if (!['today', 'week', 'last_week', 'range'].includes(String(x.period))) throw new ExchangeReview('보고 기간을 알려주세요: 오늘 / 이번 주 / 지난주 / 시작일~종료일.');
      const from = x.from == null ? null : short(x.from, 10), to = x.to == null ? null : short(x.to, 10);
      if (x.period === 'range' && (!validDate(from) || !validDate(to) || from! > to!)) throw new ExchangeReview('정산 기간을 YYYY-MM-DD ~ YYYY-MM-DD로 알려주세요.');
      return { kind: 'report', period: x.period as 'today' | 'week' | 'last_week' | 'range', from, to };
    }
    case 'help': case 'balance': case 'ignore': return { kind: x.kind };
    default: throw new ExchangeReview('거래인지 조회인지 명확히 알려주세요.');
  }
}

export function safeMoney(value: number): number {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_MONEY) throw new ExchangeReview('금액의 범위 또는 소수점 자릿수를 확인해주세요.');
  return value;
}
export function toMinor(value: string, code: ExchangeAccount, allowZero = false): number {
  const text = amountText(value), decimals = EXCHANGE_ACCOUNTS[code].scale === 100 ? 2 : 0;
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new ExchangeReview(`${EXCHANGE_ACCOUNTS[code].currency} 소수점 자릿수를 확인해주세요.`);
  const n = BigInt(whole) * BigInt(EXCHANGE_ACCOUNTS[code].scale) + BigInt(fraction.padEnd(decimals, '0') || '0');
  const result = safeMoney(Number(n));
  if (result < 0 || (!allowZero && result === 0)) throw new ExchangeReview('거래 금액은 0보다 커야 합니다.');
  return result;
}
/** Exact half-up rounding for nonnegative money, without floating-point multiplication. */
export function prorata(book: number, amount: number, balance: number): number {
  if (balance <= 0 || amount < 0 || amount > balance) throw new ExchangeReview('시제 잔액과 지급 금액을 확인해주세요.');
  const numerator = BigInt(safeMoney(book)) * BigInt(safeMoney(amount));
  const denominator = BigInt(safeMoney(balance));
  return safeMoney(Number((numerator * BigInt(2) + denominator) / (denominator * BigInt(2))));
}
export function convertToVnd(amountMinor: number, code: 'KRW_BANK' | 'KRW_CASH' | 'USD_CASH', rate: string): number {
  const text = amountText(rate), [whole, fraction = ''] = text.split('.');
  const units = BigInt('1' + '0'.repeat(fraction.length));
  const rateUnits = BigInt(whole) * units + BigInt(fraction || '0');
  if (rateUnits <= BigInt(0)) throw new ExchangeReview('환율은 0보다 커야 합니다.');
  const numerator = BigInt(amountMinor) * rateUnits;
  const denominator = BigInt(EXCHANGE_ACCOUNTS[code].scale) * units;
  // Never choose an unstated rounding rule for a customer's payout.
  if (numerator % denominator !== BigInt(0)) throw new ExchangeReview('계산된 지급액에 1동 미만이 남습니다. 실제 지급한 동 금액을 알려주세요.');
  return safeMoney(Number(numerator / denominator));
}
export function emptyExchangeState(): ExchangeState {
  return { initialized: false, version: 0, opened_at: null, accounts: { VND_CASH: { balance_minor: 0, book_vnd: 0 }, VND_BANK: { balance_minor: 0, book_vnd: 0 }, KRW_BANK: { balance_minor: 0, book_vnd: 0 }, KRW_CASH: { balance_minor: 0, book_vnd: 0 }, USD_CASH: { balance_minor: 0, book_vnd: 0 } } };
}
function isVnd(code: ExchangeAccount) { return EXCHANGE_ACCOUNTS[code].currency === 'VND'; }
export function formatMoney(minor: number, code: ExchangeAccount): string {
  return `${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: EXCHANGE_ACCOUNTS[code].scale === 100 ? 2 : 0 }).format(minor / EXCHANGE_ACCOUNTS[code].scale)} ${EXCHANGE_ACCOUNTS[code].currency}`;
}
function newPlan(kind: ExchangePlan['kind'], state: ExchangeState, note: string): ExchangePlan {
  return { kind, version: state.version, postings: [], journal: [], fee_vnd: 0, fx_profit_vnd: 0, expense_vnd: 0, capital_vnd: 0, valuation_incomplete: false, external_reference: null, reverses_reference: null, note, rate_used: null, summary: [] };
}
function addPosting(plan: ExchangePlan, state: ExchangeState, code: ExchangeAccount, delta: number, book: number | null) {
  if (!delta) return;
  const prior = plan.postings.find(x => x.account === code), before = state.accounts[code];
  const amount = safeMoney((prior?.amount_minor || 0) + delta);
  const bookDelta = prior?.book_delta_vnd === null || book === null ? null : safeMoney((prior?.book_delta_vnd || 0) + book);
  const after = safeMoney(before.balance_minor + amount);
  if (!isVnd(code) && after < 0) throw new ExchangeReview(`${EXCHANGE_ACCOUNTS[code].label} 잔액이 부족합니다. 현재 ${formatMoney(before.balance_minor, code)}입니다. 누락된 보충/거래를 먼저 확인해주세요.`);
  const afterBook = after === 0 ? 0 : before.book_vnd === null || bookDelta === null ? null : safeMoney(before.book_vnd + bookDelta);
  if (!isVnd(code) && afterBook !== null && afterBook < 0) throw new ExchangeReview('원가 잔액이 맞지 않습니다. 원거래를 먼저 확인해주세요.');
  const p: ExchangePosting = { account: code, amount_minor: amount, book_delta_vnd: bookDelta, before_minor: before.balance_minor, before_book_vnd: before.book_vnd, after_minor: after, after_book_vnd: afterBook };
  if (prior) Object.assign(prior, p); else plan.postings.push(p);
}
function finishPlan(plan: ExchangePlan): ExchangePlan {
  plan.postings = plan.postings.filter(p => p.amount_minor !== 0);
  plan.journal = plan.postings.map(p => ({ account: p.account, debit_vnd: p.book_delta_vnd }));
  if (plan.kind === 'opening') plan.journal.push({ account: 'OPENING_EQUITY', debit_vnd: plan.capital_vnd === null ? null : -plan.capital_vnd });
  else if (plan.capital_vnd !== 0) plan.journal.push({ account: 'CAPITAL_EQUITY', debit_vnd: plan.capital_vnd === null ? null : -plan.capital_vnd });
  if (plan.fee_vnd) plan.journal.push({ account: 'FEE_REVENUE', debit_vnd: -plan.fee_vnd });
  if (plan.fx_profit_vnd !== 0) plan.journal.push({ account: 'FX_REVENUE', debit_vnd: plan.fx_profit_vnd === null ? null : -plan.fx_profit_vnd });
  if (plan.expense_vnd) plan.journal.push({ account: 'OPERATING_EXPENSE', debit_vnd: plan.expense_vnd });
  const known = plan.journal.every(x => x.debit_vnd !== null);
  if (known && plan.journal.reduce((s, x) => safeMoney(s + x.debit_vnd!), 0) !== 0) throw Error('Exchange journal does not balance');
  plan.valuation_incomplete = !known;
  return plan;
}

export function planExchange(intent: Exclude<ExchangeIntent, { kind: 'reversal' | 'report' | 'balance' | 'help' | 'ignore' }>, state: ExchangeState): ExchangePlan {
  if (intent.kind === 'opening') {
    if (state.initialized) throw new ExchangeReview('기초 시제는 이미 확정되어 있습니다. 실제 보충·회수나 원거래 취소로 변경 이력을 남겨주세요.');
    const plan = newPlan('opening', state, intent.note);
    let capital: number | null = 0;
    for (const code of ACCOUNT_CODES) {
      const balance = toMinor(intent.balances[code] ?? '0', code, true);
      const basisText = isVnd(code) ? null : intent.basis_vnd[code as 'KRW_BANK' | 'KRW_CASH' | 'USD_CASH'];
      const book = isVnd(code) ? balance : balance === 0 ? 0 : basisText == null ? null : toMinor(basisText, 'VND_CASH');
      if (balance === 0 && basisText != null && toMinor(basisText, 'VND_CASH', true) !== 0) throw new ExchangeReview('잔액이 0인 외화의 취득원가도 0이어야 합니다.');
      addPosting(plan, state, code, balance, book);
      capital = capital === null || book === null ? null : safeMoney(capital + book);
      plan.summary.push(`${EXCHANGE_ACCOUNTS[code].label}: ${formatMoney(balance, code)}${!isVnd(code) && balance ? book === null ? ' · 취득원가 미확인' : ` · 원가 ${formatMoney(book, 'VND_CASH')}` : ''}`);
    }
    plan.capital_vnd = capital;
    return finishPlan(plan);
  }
  if (!state.initialized) throw new ExchangeReview('현재 시제를 아직 확정하지 않았습니다. 관리자에게 동 현금·베트남 계좌·원화 계좌·달러 현금의 기초 잔액(없는 통화는 0)을 먼저 등록해달라고 요청해주세요. 이전 채팅 잔액은 가져오지 않습니다.');
  if (intent.kind === 'movement') {
    const plan = newPlan('movement', state, intent.note), amount = toMinor(intent.amount, intent.account), sign = intent.direction === 'in' ? 1 : -1;
    plan.external_reference = intent.external_reference;
    if (intent.category === 'fee' && intent.direction !== 'in') throw new ExchangeReview('지급 수수료는 비용으로 기록해주세요. 받은 수수료만 수수료 수입입니다.');
    if (intent.category === 'fx_profit' && intent.direction !== 'in') throw new ExchangeReview('환전수익은 실제 받은 동 금액으로 알려주세요.');
    if (intent.category === 'expense' && intent.direction !== 'out') throw new ExchangeReview('비용은 실제 지급액입니다. 환불이라면 원거래 번호로 취소해주세요.');
    if (intent.category !== 'capital' && !isVnd(intent.account)) throw new ExchangeReview('외화 수수료/비용은 동 환산원가 확인이 필요합니다. 동 수수료/비용과 환전 거래를 분리해 알려주세요.');
    let book: number | null;
    if (isVnd(intent.account)) book = sign * amount;
    else if (sign > 0) book = intent.basis_vnd == null ? null : toMinor(intent.basis_vnd, 'VND_CASH');
    else { const b = state.accounts[intent.account]; book = b.book_vnd == null ? null : -prorata(b.book_vnd, amount, b.balance_minor); }
    addPosting(plan, state, intent.account, sign * amount, book);
    if (intent.category === 'capital') plan.capital_vnd = book;
    if (intent.category === 'fee') plan.fee_vnd = amount;
    if (intent.category === 'fx_profit') plan.fx_profit_vnd = amount;
    if (intent.category === 'expense') plan.expense_vnd = amount;
    plan.summary.push(`${EXCHANGE_ACCOUNTS[intent.account].label} ${sign > 0 ? '입금' : '출금'} ${formatMoney(amount, intent.account)}`, `분류: ${intent.category === 'capital' ? '시제 보충·회수 (수익 제외)' : intent.category === 'fee' ? '수수료 수입' : intent.category === 'fx_profit' ? '환전수익' : '비용'}`, intent.note);
    return finishPlan(plan);
  }
  const plan = newPlan('exchange', state, intent.note);
  plan.external_reference = intent.external_reference;
  const incoming = intent.received.account, outgoing = intent.paid.account;
  if (incoming === outgoing) throw new ExchangeReview('받은 시제와 지급한 시제가 같습니다. 실제 계좌/현금 이동 경로를 구분해주세요.');
  let received = toMinor(intent.received.amount, incoming), paid: number;
  const fee = intent.fee ? toMinor(intent.fee.amount, intent.fee.account, true) : 0;
  if (intent.received_includes_fee && fee) {
    if (intent.fee!.account !== incoming || !isVnd(incoming)) throw new ExchangeReview('수수료가 포함된 입금 계정과 수수료 수령 계정이 일치하지 않습니다.');
    received = safeMoney(received - fee);
    if (received <= 0) throw new ExchangeReview('수수료를 제외한 환전 원금이 0보다 커야 합니다.');
  }
  if (intent.paid.amount != null) paid = toMinor(intent.paid.amount, outgoing);
  else {
    if ((incoming !== 'KRW_BANK' && incoming !== 'KRW_CASH' && incoming !== 'USD_CASH') || !isVnd(outgoing)) throw new ExchangeReview('실제로 지급한 금액과 통화를 알려주세요.');
    const rate = intent.rate_vnd || DEFAULT_EXCHANGE_RATES[(incoming === 'KRW_BANK' || incoming === 'KRW_CASH') ? 'KRW' : 'USD'];
    paid = convertToVnd(received, incoming, rate);
    if (paid <= 0) throw new ExchangeReview('실제 지급액을 확인해주세요.');
    plan.rate_used = `${rate} VND/${EXCHANGE_ACCOUNTS[incoming].currency}${intent.rate_vnd ? '' : ' (설정된 기본 환율)'}`;
  }
  if (intent.rate_vnd && intent.paid.amount != null && (incoming === 'KRW_BANK' || incoming === 'USD_CASH') && isVnd(outgoing)) {
    if (convertToVnd(received, incoming, intent.rate_vnd) !== paid) throw new ExchangeReview('입력한 환율과 지급액이 일치하지 않습니다. 실제 받은 금액·지급액을 확인해주세요.');
    plan.rate_used = `${intent.rate_vnd} VND/${EXCHANGE_ACCOUNTS[incoming].currency}`;
  }
  if (isVnd(incoming) && isVnd(outgoing)) {
    if (received !== paid) throw new ExchangeReview('동 입금 원금과 현금 지급액의 차이가 있습니다. 차액이 별도 수수료인지, 일부 미지급인지 알려주세요. 차액을 수익으로 추정하지 않습니다.');
    addPosting(plan, state, incoming, received, received);
    addPosting(plan, state, outgoing, -paid, -paid);
  } else if (!isVnd(incoming) && isVnd(outgoing)) {
    // Acquisition of foreign inventory, measured at the actual VND paid. Principal is not income.
    addPosting(plan, state, incoming, received, paid);
    addPosting(plan, state, outgoing, -paid, -paid);
    plan.summary.push('받은 외화의 취득원가를 기록했습니다. 수익은 별도로 알려주신 금액만 집계합니다.');
  } else if (isVnd(incoming) && !isVnd(outgoing)) {
    const balance = state.accounts[outgoing];
    const cost = balance.book_vnd === null ? null : prorata(balance.book_vnd, paid, balance.balance_minor);
    addPosting(plan, state, incoming, received, received);
    addPosting(plan, state, outgoing, -paid, cost === null ? null : -cost);
    plan.fx_profit_vnd = 0;
    plan.capital_vnd = cost === null ? null : safeMoney(received - cost);
    plan.summary.push('환전 원금 이동 · 수익은 별도 입력 시에만 집계합니다.');
    if (cost === null) plan.summary.push('지급 외화의 취득원가가 없어 환전 차익은 미확정입니다.');
  } else throw new ExchangeReview('외화 간 직접 교환은 동 기준 취득원가를 확인한 뒤 기록해야 합니다. 두 거래로 나눠 실제 동 수령·지급 내역을 알려주세요.');
  if (fee) addPosting(plan, state, intent.fee!.account, fee, fee);
  plan.fee_vnd = fee;
  plan.summary.unshift(`원금 수령: ${EXCHANGE_ACCOUNTS[incoming].label} ${formatMoney(received, incoming)}`, `원금 지급: ${EXCHANGE_ACCOUNTS[outgoing].label} ${formatMoney(paid, outgoing)}`);
  if (fee) plan.summary.push(`별도 수수료 수령: ${EXCHANGE_ACCOUNTS[intent.fee!.account].label} ${formatMoney(fee, 'VND_CASH')}`);
  if (plan.rate_used) plan.summary.push(`적용 환율: ${plan.rate_used}`);
  return finishPlan(plan);
}

/** Foreign-cost reversals also require the DB's no-later-foreign-posting check. */
export function reverseExchange(original: ExchangeEvent, state: ExchangeState, note: string): ExchangePlan {
  if (!state.initialized || ['opening', 'reversal'].includes(original.plan.kind)) throw new ExchangeReview('기초 시제와 취소 전표는 일반 취소 대상이 아닙니다.');
  const plan = newPlan('reversal', state, note);
  plan.reverses_reference = original.reference;
  plan.fee_vnd = -original.plan.fee_vnd;
  plan.fx_profit_vnd = original.plan.fx_profit_vnd === null ? null : -original.plan.fx_profit_vnd;
  plan.expense_vnd = -original.plan.expense_vnd;
  plan.capital_vnd = original.plan.capital_vnd === null ? null : -original.plan.capital_vnd;
  for (const p of original.plan.postings) addPosting(plan, state, p.account, -p.amount_minor, p.book_delta_vnd === null ? null : -p.book_delta_vnd);
  plan.summary = [`원거래 ${original.reference}의 반대 전표를 추가했습니다.`, `사유: ${note}`];
  return finishPlan(plan);
}

export function isAmbiguousBareAmount(text: string): boolean { return /^[+-]?\s*[\d,]+(?:\.\d+)?\s*(?:만|천|백만|m|k)?\s*[.!?]?$/i.test(text.trim()); }
export function validDate(text: string | null): boolean {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
export function vietnamDate(epochSeconds: number): string {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) throw Error('Invalid message date');
  return new Date(epochSeconds * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
export function reportDates(intent: Extract<ExchangeIntent, { kind: 'report' }>, today: string): { from: string; to: string } {
  if (!validDate(today)) throw Error('Invalid business date');
  if (intent.period === 'range') {
    if (!validDate(intent.from) || !validDate(intent.to) || intent.from! > intent.to!) throw new ExchangeReview('보고 기간을 확인해주세요.');
    if (Date.parse(intent.to!) - Date.parse(intent.from!) > 366 * 86400000) throw new ExchangeReview('정산 기간은 한 번에 1년 이내로 조회해주세요.');
    return { from: intent.from!, to: intent.to! };
  }
  if (intent.period === 'today') return { from: today, to: today };
  const date = new Date(`${today}T00:00:00Z`), mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset - (intent.period === 'last_week' ? 7 : 0));
  const from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { from, to: intent.period === 'last_week' ? date.toISOString().slice(0, 10) : today };
}
