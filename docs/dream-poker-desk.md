# Dream Poker Desk

New staff workspace: `/operations`, Korean/Vietnamese. Existing guest reservations and lookup tokens are preserved. Seat holds are explicitly labelled HOLD, never presented as real players.

## Current deliverable
- Level 4 continuing-player count; remaining capacity.
- One-seat hold request under LEE DAE JIN or KIM JEE WEON, explicit agent code.
- Staff approval, same-game replacement with an existing pending guest, waitlist, rejection, check-in.
- Transactional capacity checks and replacement; guest lookup token retained.
- Durable event history and Telegram outbox with leases/retry visibility.
- Existing Telegram callback authorization retained; new audited decision function.
- Live database subscription plus 5-second polling while staff page is visible.

## Activation gate
This branch is NOT live until database installation, Vercel configuration and integration checks succeed. Existing Telegram approval PR #2 is included as a base and was not activated previously.

1. Review and apply `supabase/desk_setup.sql` once in the existing Dream project. It adds columns, a private staff event table, functions and two triggers. Existing reservations are preserved. Do not run twice (named policy/triggers intentionally fail instead of silently replacing unknown state).
2. Configure server-only `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_APPROVER_IDS` (cashier numeric IDs), `CRON_SECRET`; preserve existing public Supabase keys and saved Telegram group. Set `DREAM_DESK_ENABLED=true` only with migration installed; `NEXT_PUBLIC_SITE_URL` is the production origin.
3. Set Telegram webhook `/api/telegram/webhook` with the secret header and callback_query updates. Set display name to Dream Poker Desk. Never paste tokens into staff chats or source control.
4. Schedule authenticated GET `/api/desk/dispatch` every minute. Without scheduling, immediate guest/desk requests and staff actions trigger delivery, but unattended retries are not guaranteed.
5. Test guest request → staff group notification → approved cashier callback → guest status; hold → approve → pending guest replacement → check-in; forbidden approver; duplicate callback; full capacity; network failure then retry. Use a clearly labelled test game, never fictional customer reservations in live games.

## Operational semantics and limits
- Continuing count is for next-round players who are NOT already represented in that game's reservation list. Never count them twice. Next rounds must be separate reservation_games records.
- Pending holds are requests, not confirmed seats. They reduce further hold requests, but public seat availability is reduced only after confirmation.
- Staff web actions use existing admin/staff permissions. Telegram approvals require numeric allowlist and matching group. Separate desk/cashier web roles are not yet introduced.
- Notifications are at-least-once: a timeout after Telegram accepts a message can yield a repeated notification. Event reference identifies duplicates; database decisions cannot consume the same hold twice.
- Automatic free-form chat interpretation/task creation and automatic 2–3 seat replenishment are not enabled. Level 4 input and hold requests are explicit staff actions. Keep existing booking links active until full acceptance checks pass.
