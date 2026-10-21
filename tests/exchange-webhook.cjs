const assert = require('node:assert/strict');
const agent = require('../.test-build/exchange-agent');
const telegram = require('../.test-build/exchange-telegram');

(async () => {
  const env = { ...process.env }, originalDb = agent.exchangeDb, originalTelegram = telegram.exchangeTelegram, originalFetch = global.fetch;
  try {
    process.env.EXCHANGE_TELEGRAM_BOT_TOKEN = '100001:abcdefghijklmnopqrstuvwxyz123456';
    process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET = 'synthetic_exchange_secret_123456';
    process.env.EXCHANGE_TELEGRAM_CHAT_ID = '-1000001';
    process.env.EXCHANGE_ACTIVATED_AT = '2026-10-21T00:00:00Z';
    process.env.EXCHANGE_ADMIN_USER_IDS = '200001';
    delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN; delete process.env.RESERVATION_TELEGRAM_BOT_TOKEN;
    const base = { update_id: 1, message: { message_id: 101, date: Date.parse('2026-10-21T01:00:00Z') / 1000, chat: { id: -1000001, type: 'group' }, from: { id: 200001, is_bot: false }, text: 'synthetic record' } };
    let dbCalls = 0, aiCalls = 0, replyCalls = 0;
    agent.exchangeDb = () => { dbCalls++; throw Error('A filtered update must not access storage'); };
    global.fetch = async () => { aiCalls++; throw Error('Filtered messages must never reach AI'); };
    const request = secret => new Request('https://example.invalid/api/exchange/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret } });
    assert.equal(telegram.exchangeAuthorized(request('wrong_role_secret')), false);
    assert.equal(telegram.exchangeAuthorized(request(process.env.EXCHANGE_TELEGRAM_WEBHOOK_SECRET)), true);
    await agent.handleExchangeUpdate({ ...base, message: { ...base.message, chat: { id: -1000002, type: 'group' } } });
    await agent.handleExchangeUpdate({ ...base, message: { ...base.message, chat: { id: -1000001, type: 'private' } } });
    await agent.handleExchangeUpdate({ ...base, message: { ...base.message, date: Date.parse('2026-10-20T23:59:59Z') / 1000 } });
    await agent.handleExchangeUpdate({ ...base, message: { ...base.message, from: { id: 200001, is_bot: true } } });
    await agent.handleExchangeUpdate({ ...base, message: { ...base.message, sender_chat: { id: -1000001 } } });
    assert.equal(dbCalls, 0);

    let job, committed = 0;
    const fakeDb = {
      rpc: async (name, args) => {
        if (name === 'dream_exchange_claim') {
          job = { bot_id: args.p_bot_id, update_id: args.p_update_id, chat_id: args.p_chat_id, message_id: args.p_message_id, sender_id: args.p_sender_id, source_date: args.p_source_date, raw_text: args.p_text, owner: args.p_owner, status: 'processing', reply_state: 'unsent', reply_text: null, plan: null, intent: null };
          return { data: { disposition: 'claimed', job: { ...job } }, error: null };
        }
        if (name === 'dream_exchange_claim_reply') { job.reply_state = 'sending'; return { data: true, error: null }; }
        if (name === 'dream_exchange_commit') committed++;
        throw Error('Unexpected RPC ' + name);
      },
      from: name => {
        assert.equal(name, 'dream_exchange_jobs');
        const chain = { update(patch) { Object.assign(job, patch); return chain; }, eq() { return chain; }, select() { return chain; }, async single() { return { data: { ...job }, error: null }; } };
        return chain;
      },
    };
    agent.exchangeDb = () => fakeDb;
    telegram.exchangeTelegram = async (method) => { assert.equal(method, 'sendMessage'); replyCalls++; return { message_id: 1000 + replyCalls }; };
    await agent.handleExchangeUpdate({ update_id: 2, edited_message: { ...base.message, text: 'edited amount 50000' } });
    assert.equal(job.status, 'review'); assert.match(job.reply_text, /수정된 메시지/);
    await agent.handleExchangeUpdate({ ...base, update_id: 3, message: { ...base.message, forward_origin: { type: 'user' } } });
    assert.equal(job.status, 'review'); assert.match(job.reply_text, /과거 내역/);
    await agent.handleExchangeUpdate({ ...base, update_id: 4, message: { ...base.message, text: '+50000' } });
    assert.equal(job.status, 'review'); assert.match(job.reply_text, /통화/);
    assert.equal(committed, 0); assert.equal(aiCalls, 0); assert.equal(replyCalls, 3);
    console.log('exchange webhook: wrong-room, pre-activation, bot, auth, forwarded/edited and ambiguous-message boundaries passed');
  } finally {
    agent.exchangeDb = originalDb; telegram.exchangeTelegram = originalTelegram; global.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
