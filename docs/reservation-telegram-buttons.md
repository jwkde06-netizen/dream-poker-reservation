# Reservation staff buttons

Public reservation alerts use two inline callback buttons in the configured reservation staff group: CONFIRM and CONTACT DESK. They do not open external pages. Callback data uses the rr: namespace, separate from local-app lr: and accounting handlers. The existing webhook URL and shared-secret check stay unchanged.

CONFIRM approves the current game (including Next 5M) under the existing game lock and capacity limit. CONTACT DESK sets a separate contact-required flag; it does not approve or cancel a seat. Players see a KakaoTalk contact instruction in My reservations. Confirmation clears that flag. Confirmed seats remain counted while a contact request is open.

The server verifies the stored delivery receipt, configured chat, current reservation version and Telegram group membership before applying either action. Telegram actor ID, name and action are audited. Guest/authenticated Data API users cannot invoke the service-only action procedures.

Updates reuse the same Telegram message through the persisted delivery queue. Failed delivery is retried. A stale callback cannot overwrite a later staff action, cancellation or reassignment. Cancelled/rejected/completed bookings have no active buttons. If the original message was deleted, delivery creates a replacement.

Deploy the reservation_telegram_buttons migration before the app. For an old sent alert, operators can requeue the specific existing outbox row while retaining its verified message ID and chat ID; the new worker edits that message rather than creating another booking. Do not reset reservation status or approve a real booking as a test.

Validation: reservation-telegram-actions.cjs, reservation-agent.cjs, reservation-webhook.cjs, reservation-local-actions.cjs and the rollback-only reservation-telegram-actions.sql. TypeScript and the production Next.js build also run before release.
