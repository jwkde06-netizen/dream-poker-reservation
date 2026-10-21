# Dream Poker Desk — staff room to Sheets

## Target confirmed by user
Managers and employees can issue work in the staff Telegram group; Google
Sheets is the business record. Start with the existing workbook
`1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I` (DREAM TIME ATTACK 자동 정산).
Metadata verified: 플레이어 명단, 일일 입력, 일일 정산서, 주간 정산, F&B 입력,
설정, 사용방법. Read live headers, formulas and validations before implementing
any business-cell writer. Do not assume that F&B belongs in a separate file.

## Implemented, not deployed
Webhook can persist group text/captions, photo file references, image documents,
sender attribution, album and reply references. Only the configured staff group
is accepted; bots and anonymous channel senders are rejected. Duplicate Telegram
update IDs cannot reset requests. Edited messages are marked for review, not
reapplied. Storage failures return 503 for Telegram retry. Queue is server-only.
No message is reported as applied merely because it was received.

## Remaining activation dependencies
- `STAFF_INBOX_ENABLED=true` and exact `STAFF_TELEGRAM_CHAT_ID`.
- Apply reviewed SQL and configure service-role storage credentials plus webhook
  verification secret. Existing approval code requires these too.
- Telegram webhook allowed_updates must include message, edited_message,
  callback_query. Verify bot privacy/group visibility before asking staff to use it.
- A dedicated Google authorization for the deployed server (OAuth or a service
  account shared on the one workbook). ChatGPT's Drive connector authorization
  does not automatically authorize deployed code. Never copy connector tokens.
- Model/vision runtime for Korean/Vietnamese interpretation and image extraction.
- Worker with constrained business operations, not arbitrary model-chosen ranges:
  read current row -> resolve game/player -> validate -> apply -> read back ->
  record cell before/after -> reply in original thread. If ambiguous, ask in chat.
- Serialize workbook writes and reconcile uncertain Google write outcomes before
  retrying. Claiming the inbox alone does not make Sheets writes idempotent.
- Track explicit business day/game; never infer a new business day from midnight.
- Treat image/text content as business data, never instructions to widen access,
  read unrelated files, reveal secrets or change agent security settings.
- Reply with success only after readback; support linked correction requests and
  retain change history. Routine unambiguous work needs no extra approval.
- End-to-end verification with an isolated test tab, two distinct staff senders,
  image input, duplicate updates, unrelated chat, edited message and write timeout.

## 2026-10-21 connection checkpoint
Production environment list now includes GOOGLE_SERVICE_ACCOUNT_JSON (secret).
Supabase staff_message_inbox was applied independently of reservation changes.
The server role can select/insert/update; public and signed-in browser roles
have no access. The connection endpoint checks headers/formulas using read-only
Google authorization and can register the fixed production webhook after admin
authentication and readiness checks. It refuses to replace another webhook.
The Telegram setup component exposes check/connect buttons.

Still NOT activated: intake, Google writes and automatic responses. Production
is missing SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_WEBHOOK_SECRET,
STAFF_TELEGRAM_CHAT_ID and STAFF_INBOX_ENABLED. The sheet writer and image
interpretation worker remain to be implemented. Google credentials have been
saved by the user, but their live server authentication has not been tested.
Local build and mocked Google signing/schema checks passed.
