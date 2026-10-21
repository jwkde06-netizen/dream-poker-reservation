# Dream reservation agent

Players submit a one-seat request on `/`. Reservations start pending. Active Korean desk and cashier accounts can review the same queue at `/desk` or `/staff`; admin and existing staff retain access. No reservation is automatically confirmed. Game creation/opening remains with admin/staff accounts.

## Workflow

- Pending → confirmed, waitlisted, rejected or cancelled.
- Waitlisted → confirmed, rejected or cancelled.
- Confirmed → waitlisted, checked in, no show or cancelled.
- Terminal bookings cannot be reopened. Create a fresh request when necessary.
- Reviews use the displayed version; a concurrent edit requires refresh. Game locks serialize seat allocation and table reassignment.
- Guest cancellation remains available using the browser's saved booking reference.
- Every relevant booking change writes a private notification job in the same transaction. Telegram messages include Vietnam date/time and links to the selected reservation for both desks.
- Failed delivery retries with backoff; a minute scheduler recovers interrupted work. The staff agent panel shows failures and requests awaiting approval for over 15 minutes. Failed jobs can be retried there.
- Delivery is at least once: an ambiguous Telegram success followed by receipt failure can produce a duplicate after lease expiry. Reservation ID/version identify the event. Approval itself is never repeated by the notification worker.

## Deployment

1. Apply `supabase/reservation_agent.sql` once. This adds capabilities with dispatch disabled and preserves legacy management until cutover.
2. Deploy the application. Server environment requires `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, and the existing public Supabase configuration. Destination uses the saved Telegram group, with `TELEGRAM_CHAT_ID` as fallback. Secrets must never have a `NEXT_PUBLIC_` prefix.
3. Verify `GET /api/reservation-agent/deliver` returns `{"ready":true}` and staff pages load.
4. Apply `supabase/reservation_agent_activate.sql` once. This enables the scheduler and retires unsafe legacy mutation/delivery paths. Already delivered initial notifications are excluded.
5. Reload any old staff tabs. Old clients receive an explicit reload message instead of overwriting a new review.

To pause delivery while retaining saved jobs: `update reservation_private.settings set enabled=false where id;`. The scheduler will stop claiming new work; already dispatched requests may finish. Do not roll the application back to a legacy browser-triggered notification version while the outbox is enabled.

The worker endpoint receives only a random, single-job token. It cannot select arbitrary recipients or message content. Database claim/receipt RPCs require the service role; staff can inspect safe summaries but cannot read dispatch tokens or forge receipts. No global credential is placed in pg_net's queue.

## Verification

`node tests/reservation-agent.cjs` checks legal UI transitions, Vietnam midnight formatting, worker claim failures, duplicate claims, privacy, successful delivery, retry and receipt failure. `node tests/telegram-setup.cjs` checks existing group setup/webhook preservation. `tests/reservation-agent.sql` is a rollback-only integration suite for permissions, seat capacity, review versions, atomic assignment, cancellation, queue leases/receipts and event ordering. It requires an existing active admin and disabled dispatch. `next build` checks production compilation and types.
