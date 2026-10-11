# Telegram one-tap cashier approval

Implemented on the `feature/telegram-inline-approvals` branch. Not active until these deployment steps are completed.

1. Run `supabase/telegram_approval.sql` in the reservation project's Supabase SQL editor. Verify the existing `reservations` and `reservation_games` schema uses UUID IDs and the latter has `capacity`.
2. In Vercel server environment variables set `SUPABASE_SERVICE_ROLE_KEY` (never a NEXT_PUBLIC value), `TELEGRAM_WEBHOOK_SECRET` (random URL-safe secret), and `TELEGRAM_APPROVER_IDS` (comma-separated numeric Telegram user IDs of authorized cashiers). Preserve `TELEGRAM_BOT_TOKEN`, public Supabase config, and existing Telegram destination.
3. Deploy the branch to a staging URL and set `NEXT_PUBLIC_SITE_URL` to that URL. After verifying, merge into production and redeploy.
4. Register the webhook using the Telegram Bot API `setWebhook` method with `url=https://<deployed-domain>/api/telegram/webhook`, `secret_token=<TELEGRAM_WEBHOOK_SECRET>`, and `allowed_updates=["callback_query"]`. Use an authenticated admin terminal, and do not post or commit bot tokens. If webhook is active, `getUpdates` group discovery no longer works; connect the group before enabling the webhook or set it directly in existing configuration.
5. Confirm: (a) guest booking posts an approve/reject button; (b) Korean desk booking does so; (c) a whitelisted cashier can approve; (d) unauthorized accounts fail; (e) second press cannot change status; (f) full game refuses approval; (g) staff and guest pages reflect the status; (h) database audit trigger captures the transition.

**Security:** The callback header secret authenticates Telegram; the Telegram user ID allowlist authorizes the cashier; a server-only service key invokes a service-role-only transaction function. The database serializes confirmations for the same game.

**Limitation:** Desk notification identifies one exact recently created pending booking (same game, name, arrival time) from the authenticated session. If more than one matches, it does not send ambiguous approval buttons. The booking remains visible in the cashier queue. If the Telegram send fails, the booking still remains pending in Supabase.

**Important:** Bot interactions cannot act without the webhook and SQL migration; changes to this repository alone do not activate the service.
