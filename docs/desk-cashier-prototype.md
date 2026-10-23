# Dream Poker desk / cashier prototype

This is an isolated demonstration mode in the existing reservation project. `/desk` and `/cashier` keep their operational staff authentication and dashboards; `?demo=1` loads the prototype. Start at `/demo`, create a room, and open its desk and cashier links on separate devices. Room capabilities expire after 72 hours and confer access only to that room's fake data, never production accounts or reservations.

## Demonstration

1. Open the Korean desk link. Add a request using one of the fixed DEMO names, Dream Poker 5M, preferred time, party size, and optional Korean/Vietnamese notes.
2. Keep the cashier link open. The request appears automatically, marked waiting. Approval is exclusively a cashier action in this prototype.
3. Approve, reject with a bilingual reason, or propose a different time. The desk sees the result and actor/time history on the same reservation.
4. Desk changes and cancellations remain requests until cashier approval. Previously confirmed seats remain held while a change/cancellation is reviewed. Rejecting a change preserves the previous booking.
5. Under the demo test tools, select response-loss simulation before submitting. The server commits, but the initiating screen deliberately loses the acknowledgement and does not claim success. Retrying the same request must produce one booking and one event.

## Actual behavior and simulated parts

- Actual server persistence: private `demo_rooms` and `demo_commands` tables, separate from operational reservations and their Telegram outbox.
- Automatic screen updates: one-second foreground polling plus immediate refresh on focus/reconnection. This is not WebSocket push and is not an app-closed notification.
- Concurrency: whole-room compare-and-swap transaction; recompute capacity after a concurrent change. Count people, not booking rows. The nine-seat demonstration is independent of the operational game capacity.
- Idempotency: stable client command IDs persisted before sending; server receipts bind IDs to room, role and payload fingerprint. No optimistic success, no unbounded automatic mutation retries.
- Same content and states appear in Korean/Vietnamese. Canned replies are bilingual. Free text translation is manual and labelled accordingly.
- KakaoTalk: manual desk entry, no automatic message ingestion.
- Telegram: preview uses the existing reservation formatter and keyboard. Demo requests never call the Telegram API or operational booking RPCs. The preview buttons are illustrative, not sent/interactive Telegram approvals. Existing live Telegram callbacks remain unchanged.
- Actor identity: demonstration desk/cashier roles, not verified employee identities. No accounts or production roles are created or changed.
- The response-loss test is a client-side fault simulation; persistence, duplicate handling and the other screen's update are real.

## Before operational rollout

Confirm the proposed workflow (cashier decision authority, group seating, change/cancellation handling), assign existing staff or authorize dedicated accounts, and connect the reviewed workflow to the canonical production reservation transaction/Telegram outbox. Do not merely swap demo credentials for production credentials: demo state is intentionally stored separately. Existing production pages and their approval controls still follow their previous rules.

Automated Kakao ingestion, automatic free-text translation and closed-app push require separate service decisions/configuration and are not claimed as implemented. No paid service or new external connection was added.

## Verification

`tests/reservation-demo.cjs` covers the transition model and actual route handlers with a transactional test adapter. `tests/reservation-demo.sql` rolls back capability, expiry, CAS, idempotency and operational-isolation checks. `tests/reservation-demo-live.cjs` runs concurrent requests against a deployed demo API only. Browser verification must additionally demonstrate the same booking changing in the desk and cashier UI; deployment alone is not acceptance.
