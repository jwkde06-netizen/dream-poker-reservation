# Reservation desk integration

## Behaviour

- Existing `reservation_games.capacity` means **new seats after returning players**, not the physical nine seats. Six returning players therefore leave a capacity of three; that value is not reduced again.
- A newly opened empty queue creates two **desk holds** (or one when only one new seat exists). Staff can select three. Labels alternate between `LEE DAE JIN` and `KIM JEE WEON` and live in a separate `reservation_desk_holds` table. They never inflate real customer or confirmed counts.
- A real website request consumes one available desk hold automatically and remains `pending`. Explicit replacement also remains `pending` and preserves that seat while awaiting cashier review. Cashier confirmation is still performed in the existing staff workflow.
- TD-confirmed carryover counts can be entered from the cashier panel or a permitted Telegram account. Nine returning players closes the queue and exposes zero new seats; changing that count can reopen it.
- Game row locks serialize seat-affecting operations. A database trigger enforces the same capacity rule for existing cashier confirmations and assignments. Repeating one operation source key returns its original result; competing replacements of one hold have one winner.
- Every command is recorded with the staff user ID or Telegram sender ID. Holds, replacements and carryover decisions have an additional private audit log.

## Files and setup

`supabase/reservation_agent.sql` is additive and must be reviewed and applied before enabling the feature. It does not modify existing customer records. Its fixture and assertions run against local PGlite in `tests/reservation-sql.cjs`, with synthetic records only.

The new tables enable RLS and revoke browser-role grants. RPCs require `service_role`; HTTP endpoints first validate the logged-in user's active profile. Private trigger functions see counts across RLS so a caller cannot overbook by hiding other rows.

Configure the reservation settings listed in `.env.example`. Mutation commands require an explicit `RESERVATION_TELEGRAM_ADMIN_USER_IDS` allowlist. The bot validates the destination room and excludes bots, channel identities, forwarded content and edited messages. Its webhook secret is checked before the handler runs.

Dedicated endpoint: `/api/reservations/webhook`. During the legacy accounting-token transition, the accounting webhook may delegate only the configured reservation room to `handleReservationUpdate`.

## Telegram commands

Use `/games` for the current game and hold IDs. These are exact commands; general prose is not silently treated as a reservation.

```text
/hold <game ID> 2
/carryover <game ID> 6
/replace <hold ID> REAL PLAYER NAME | 19:30
/book <game ID> REAL PLAYER NAME | 19:30
/release <hold ID>
```

Arrival times use Vietnam time. `/help` explains the commands in the reservation room. No command auto-confirms a customer.

## Verification and limits

Local SQL tests cover empty-queue holds, zero fabricated confirmed customers, replacement seat preservation, cashier confirmation without double counting, capacity overflow, source-key replay/conflict, competing stale replacement attempts, direct legacy moves, full-returning close/reopen and anonymous-role denial. PGlite serializes calls within one local database instance; these tests verify transactional outcomes and the lock design, not a multi-connection production load test.

Web-origin updates return an explicit notification failure after a successful database commit if Telegram cannot be reached. The database outcome remains authoritative. Telegram acknowledgement loss can leave a successfully committed command without a visible acknowledgement; `/games` is the readback. Financial accounting and exchange records are not touched by these handlers.
