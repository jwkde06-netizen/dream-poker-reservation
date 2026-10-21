import {timingSafeEqual} from 'node:crypto';

export const agentRoles = ['reservations', 'accounting', 'exchange'] as const;
export type AgentRole = typeof agentRoles[number];
export type AgentConfig = {
  role: AgentRole; name: string; token: string; secret: string; chatId: string;
  enabled: boolean; webhookPath: string; administrators: string[]; mode: string;
};
export function agentConfig(role: AgentRole): AgentConfig {
  const dedicated = process.env.ACCOUNTING_BOT_MODE === 'dedicated';
  if (role === 'reservations') return {
    role, name: 'Dream Buy-in Desk',
    token: process.env.RESERVATION_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '',
    secret: process.env.RESERVATION_TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || '',
    chatId: process.env.RESERVATION_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '',
    enabled: process.env.RESERVATION_AGENT_ENABLED === 'true',
    webhookPath: dedicated ? '/api/reservations/webhook' : '/api/accounting/webhook',
    administrators: (process.env.RESERVATION_TELEGRAM_ADMIN_USER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean),
    mode: dedicated ? 'dedicated' : 'shared_legacy',
  };
  if (role === 'accounting') return {
    role, name: 'Dream Poker Accounting',
    token: (dedicated ? process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN : process.env.TELEGRAM_BOT_TOKEN) || '',
    secret: (dedicated ? process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET : process.env.TELEGRAM_WEBHOOK_SECRET) || '',
    chatId: dedicated ? process.env.ACCOUNTING_TELEGRAM_CHAT_ID || '' : process.env.STAFF_TELEGRAM_CHAT_ID || '',
    enabled: process.env.ACCOUNTING_ENABLED === 'true', webhookPath: '/api/accounting/webhook',
    administrators: [], mode: dedicated ? 'dedicated' : 'legacy',
  };
  return {
    role, name: 'Dream Poker Exchange', token: process.env.EXCHANGE_TELEGRAM_BOT_TOKEN || '',
    secret: process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET || '',
    chatId: process.env.EXCHANGE_TELEGRAM_CHAT_ID || '',
    enabled: process.env.EXCHANGE_ENABLED === 'true', webhookPath: '/api/exchange/webhook',
    administrators: (process.env.EXCHANGE_ADMIN_USER_IDS || '').split(',').map(x=>x.trim()).filter(Boolean),
    mode: 'dedicated',
  };
}
export function agentOrigin() {
  const url = new URL(process.env.AGENT_PUBLIC_URL || 'https://dream-poker-reservation.vercel.app');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('AGENT_PUBLIC_URL must be a production HTTPS origin');
  }
  return url.origin;
}
export function validAgentRole(role: unknown): role is AgentRole {
  return typeof role === 'string' && agentRoles.some(x=>x===role);
}
export function secureEqual(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const a=Buffer.from(actual),b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}
export function missingAgentSettings(config: AgentConfig) {
  const missing: string[]=[];
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(config.token)) missing.push('봇 토큰');
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(config.secret)) missing.push('웹훅 인증값');
  if (!/^-\d{5,22}$/.test(config.chatId)) missing.push('업무방 ID');
  if (!config.enabled) missing.push('에이전트 활성화');
  if (config.role !== 'accounting' && (!config.administrators.length || config.administrators.some(id=>!/^\d+$/.test(id)))) missing.push('담당 관리자 ID');
  if (config.role === 'exchange' && (!/T.*(Z|[+-]\d{2}:\d{2})$/.test(process.env.EXCHANGE_ACTIVATED_AT || '') || !Number.isFinite(Date.parse(process.env.EXCHANGE_ACTIVATED_AT || '')))) missing.push('환전 기록 시작 시각');
  if (config.role === 'accounting' && config.mode === 'legacy') missing.push('회계 전용 봇 전환');
  if (config.role === 'accounting' && config.mode === 'dedicated' && (!/(Z|[+-]\d{2}:\d{2})$/.test(process.env.ACCOUNTING_ACTIVATED_AT || '') || !Number.isFinite(Date.parse(process.env.ACCOUNTING_ACTIVATED_AT || '')))) missing.push('회계 전환 시각');
  if (config.token && (config.role === 'exchange' || config.mode === 'dedicated') && agentRoles.some(role=>role!==config.role && agentConfig(role).token.split(':')[0]===config.token.split(':')[0])) missing.push('업무별 전용 봇 토큰');
  if (config.secret && (config.role === 'exchange' || config.mode === 'dedicated') && agentRoles.some(role=>role!==config.role && agentConfig(role).secret===config.secret)) missing.push('업무별 웹훅 인증값');
  return missing;
}
