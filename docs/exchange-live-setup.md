# Exchange-only rollout

This change adds an independent exchange ledger without modifying the existing reservation/accounting handlers or webhook credentials. It is based on the current main branch, not a wholesale merge of the three-agent draft.

## Server deployment

Apply the reviewed `supabase/exchange_agent.sql` and `supabase/exchange_connection.sql` once. They do not insert transactions, opening balances, staff IDs, or bot credentials.

Set a unique random 32-byte key encoded as 64 hexadecimal characters in the production secret `EXCHANGE_SETTINGS_KEY`. Keep it server-only and retain it for the lifetime of encrypted credentials. Also set `EXCHANGE_TELEGRAM_BOT_USERNAME=dream_poker_exchange_bot`. Never commit these credentials or log their values. No other agent's token, webhook or environment setting should be changed.

Deploy the reviewed exchange-only commit. The new webhook refuses preview environments. Until setup and opening float are complete, no exchange is posted.

## One-time manager setup

1. Open the production `/exchange` page and sign in with the existing Dream Poker administrator account.
2. Paste the dedicated Exchange bot's BotFather token into the password field on this page, not ChatGPT or a group chat. The server verifies the identity and refuses reservation/accounting tokens and conflicting webhooks. Credentials are AES-256-GCM encrypted before storage in a service-only RLS table.
3. Add the Exchange bot to the intended private Exchange room as administrator (no delete/ban rights needed). A human group administrator sends the one-time pairing command shown on the page. The command expires in 15 minutes. Numeric room and manager IDs are discovered from this authenticated Telegram event, not guessed from names.
4. The manager posts actual opening VND cash, VND bank, KRW bank and USD cash balances, explicitly including zero balances, and confirms the bot's preview. Supply foreign-currency historical VND cost if known; otherwise valuation remains unknown. Do not copy old balances or create synthetic production transactions.
5. Verify `시제`, then an approved, already-completed real exchange. Confirm its receipt, ledger event and before/after balances. Until this is done, live Telegram recording is not verified.

The web ledger refreshes every 15 seconds while visible. It shows the latest 100 entries, up to 50 unresolved inputs and full selected-period totals. Reports distinguish known realized profit from missing cost or incomplete periods. Money transfers are never executed.

## Verification

In an isolated workspace, install dependencies and the exact test-only package `@electric-sql/pglite@0.5.10` without changing production manifests. Compile the lib TS files to `.test-build` as CommonJS/ES2020 and run `tests/exchange.cjs`, `tests/exchange-webhook.cjs`, `tests/exchange-sql.cjs`, `tests/exchange-settings.cjs`, then `npm run build`. Use synthetic inputs only in PGlite, never the production database.
