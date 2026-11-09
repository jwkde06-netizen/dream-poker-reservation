import { createHash } from 'node:crypto';
import { setupTelegram, TelegramSetupFailure } from './exchange-settings';
import { exchangeConfig, ExchangeConfig } from './exchange-telegram';

export const EXCHANGE_MENU_VERSION = 'exchange-menu-20261109-v3';
export const EXCHANGE_COMMANDS = [
      { command: 'status', description: '현재 환전 시제' },
      { command: 'fx', description: '환전 · /fx 315000원 550만동 (받은 금액 → 준 금액)' },
      { command: 'in', description: '시제 보충 · /in 100불' },
      { command: 'out', description: '시제 회수 · /out 10만동' },
      { command: 'expense', description: '비용 · /expense 5만동' },
      { command: 'profit', description: '환전수익 · /profit 10만동' },
      { command: 'loss', description: '환전손실 · /loss 10만동' },
      { command: 'opening', description: '최초 시제 미리보기 · /opening 1억동 0원 100불' },
      { command: 'cancel', description: '기록취소 · /cancel FX-번호 사유' },
      { command: 'vnd', description: '동 시제 설정 · /vnd 1억 또는 /vnd 100000000' },
      { command: 'usd', description: '달러 시제 설정 · /usd 1700' },
      { command: 'krw', description: '원화 계좌 시제 설정 · /krw 315000' },
      { command: 'krwin', description: '원화 추가 · /krwin 315000 (계좌로 통합)' },
      { command: 'krwout', description: '원화 차감 · /krwout 100000 (계좌로 통합)' },
      { command: 'float', description: '총 유통 시제 설정 · /float 1억 · 잔액·수익 변경 없음' },
      { command: 'sentbe', description: '센트비 이동 · Google 환율로 동 시제 추가' },
      { command: 'memo', description: '비고 추가·목록 · /memo 시제 3900만동 대니형님께 인계' },
      { command: 'memodel', description: '비고 삭제 · /memodel 1' },
      { command: 'week', description: '이번 주 수익·정산' },
      { command: 'today', description: '오늘 거래 내역' },
      { command: 'fee', description: '이체수수료 추가 · 예: /fee 100만동' },
      { command: 'fee5', description: '이체수수료 5만동 기록' },
      { command: 'fee10', description: '이체수수료 10만동 기록' },
      { command: 'fxsnapshot', description: '과거 수기 시제 안내' },
      { command: 'lastweek', description: '지난주 수익·정산' },
      { command: 'help', description: '사용법 · 슬래시 명령어로만 기록' },
      { command: 'commands', description: '명령어 메뉴 다시 등록' },
    ];
const verified = new Map<string, number>();
const pending = new Map<string, Promise<void>>();
const TTL_MS = 15 * 60 * 1000;
export function menuMatches(actual: unknown): boolean {
  return Array.isArray(actual) && actual.length === EXCHANGE_COMMANDS.length &&
    EXCHANGE_COMMANDS.every((command, i) => actual[i]?.command === command.command && actual[i]?.description === command.description);
}
export async function readCommandMenus(config: ExchangeConfig = exchangeConfig()) {
  const scope = { type: 'chat', chat_id: config.chatId };
  const defaults = await setupTelegram(config.token, 'getMyCommands', { scope });
  const korean = await setupTelegram(config.token, 'getMyCommands', { scope, language_code: 'ko' });
  return { defaults, korean, matches: menuMatches(defaults) && menuMatches(korean) };
}
export function logMenuFailure(error: unknown) {
  // Never log raw exceptions, Telegram descriptions, request URLs or credentials.
  console.error('exchange_menu_failed', error instanceof TelegramSetupFailure
    ? { method: error.method, status: error.status, reason: error.reason }
    : { reason: 'verification_failed' });
}
/** Only the already-linked chat scope, never global bot commands. */
export async function ensureCommandMenu(force = false, config: ExchangeConfig = exchangeConfig()): Promise<void> {
  const key = createHash('sha256').update(config.token + ':' + config.chatId + ':' + EXCHANGE_MENU_VERSION).digest('hex');
  const existing = pending.get(key);
  if (existing) { if (!force) return existing; await existing.catch(() => {}); }
  if (!force && (verified.get(key) || 0) > Date.now()) return;
  const work = (async () => {
    verified.delete(key);
    const scope = { type: 'chat', chat_id: config.chatId };
    await setupTelegram(config.token, 'setMyCommands', { scope, commands: EXCHANGE_COMMANDS });
    await setupTelegram(config.token, 'setMyCommands', { scope, language_code: 'ko', commands: EXCHANGE_COMMANDS });
    if (!(await readCommandMenus(config)).matches) throw Error('Command menu verification failed');
    if (verified.size >= 100) verified.clear();
    verified.set(key, Date.now() + TTL_MS);
    console.info('exchange_menu_verified', { menuVersion: EXCHANGE_MENU_VERSION, commandCount: EXCHANGE_COMMANDS.length });
  })();
  pending.set(key, work);
  try { await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}
