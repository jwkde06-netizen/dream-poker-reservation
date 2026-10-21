# Dream Staff accounting agent

Authorized group: -5322020390. Fixed workbook: 1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I.

New isolated webhook: /api/accounting/webhook. Existing reservation app remains unchanged.
Ops POST /api/accounting/ops requires ACCOUNTING_OPS_SECRET Bearer; only inspect, modeltest, connect are supported. It never returns credentials. Connect refuses to replace another webhook.

Supports exact-master-name game additions, cumulative buyin totals, cancellation by clearing input cells (retains formula spill columns), F&B append. Model extracts only, server validates all ranges and values. Ambiguous requests ask in the source thread. Replies can supply missing context. Edited messages require a new correction. Repeated Telegram update IDs do not reapply; repeated processed image IDs are ignored.

A server-only Postgres mutex serializes writes. No lock expiry: crash or uncertain Google response requires operator reconciliation using the job's before/after plan before releasing the mutex. Do not blindly retry uncertain writes. Before/after cell values are persisted before mutations. Success is sent only after readback. All Google inputs use RAW values, preventing formula injection. Read-modify-write is rechecked immediately before write; humans editing the same cells concurrently remain an operational limitation (Google Sheets has no compare-and-swap).

Model: openai/gpt-5-mini through Vercel AI Gateway OIDC (live catalog verified vision support). AI_GATEWAY_MODEL overrides only by server configuration. No provider credentials in client.

Not yet implemented: automatic weekly scheduling, arbitrary existing expense-row corrections, album aggregation, durable retry of crashed model requests. Requests outside supported operations require clarification. Normal staff group membership is the authorization boundary, excluding bots and anonymous senders.

Local verification: TypeScript + Next build and tests/accounting.cjs. Live deployment verification is recorded separately; code deployment alone is not evidence of active Telegram intake.
