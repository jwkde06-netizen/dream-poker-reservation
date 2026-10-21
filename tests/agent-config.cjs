const assert=require('node:assert/strict');
const {agentConfig,secureEqual,missingAgentSettings,agentOrigin}=require('../.test-build/agent-config');
const saved={...process.env};
try{
  process.env.TELEGRAM_BOT_TOKEN='100000:test_old_token';
  process.env.TELEGRAM_WEBHOOK_SECRET='legacy_webhook_secret';
  process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN='200000:test_new_token';
  process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET='accounting_webhook_secret';
  delete process.env.ACCOUNTING_BOT_MODE;
  assert.equal(agentConfig('accounting').token,process.env.TELEGRAM_BOT_TOKEN,'staging a dedicated token must not switch the live bot');
  process.env.ACCOUNTING_BOT_MODE='dedicated';
  assert.equal(agentConfig('accounting').token,process.env.ACCOUNTING_TELEGRAM_BOT_TOKEN);
  assert.equal(agentConfig('reservations').token,process.env.TELEGRAM_BOT_TOKEN);
  delete process.env.ACCOUNTING_TELEGRAM_WEBHOOK_SECRET;
  assert.equal(agentConfig('accounting').secret,'','dedicated mode must never reuse reservation credentials');
  assert(missingAgentSettings(agentConfig('accounting')).includes('웹훅 인증값'));
  delete process.env.EXCHANGE_ADMIN_USER_IDS;
  assert(missingAgentSettings(agentConfig('exchange')).includes('담당 관리자 ID'));
  assert.equal(secureEqual('secret','secret'),true);
  assert.equal(secureEqual('',''),false);
  assert.equal(secureEqual('wrong','secret'),false);
  process.env.AGENT_PUBLIC_URL='https://dream-poker-reservation.vercel.app/path';
  assert.throws(agentOrigin);
  process.env.AGENT_PUBLIC_URL='http://dream-poker-reservation.vercel.app';
  assert.throws(agentOrigin);
  console.log('Agent identity, credential isolation and setup checks passed');
}finally{
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
  Object.assign(process.env,saved);
}
