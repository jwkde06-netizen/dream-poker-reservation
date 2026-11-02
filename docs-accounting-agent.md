# Dream Staff accounting agent

Authorized group: -5322020390. Fixed workbook: 1QJUPswetSgSFAlKkDXdY_WMmM6LCp6nXs9EvmuQF22I.

New isolated webhook: /api/accounting/webhook. Existing reservation app remains unchanged.
Ops POST /api/accounting/ops requires ACCOUNTING_OPS_SECRET Bearer; only inspect, modeltest, connect are supported. It never returns credentials. Connect refuses to replace another webhook.

Supports exact-master-name game additions, cumulative buyin totals, cancellation by clearing input cells (retains formula spill columns), F&B append. Model extracts only, server validates all ranges and values. Ambiguous requests ask in the source thread. Replies can supply missing context. Edited messages require a new correction. Repeated Telegram update IDs do not reapply; repeated processed image IDs are ignored.

A server-only Postgres mutex serializes writes. No lock expiry: crash or uncertain Google response requires operator reconciliation using the job's before/after plan before releasing the mutex. Do not blindly retry uncertain writes. Before/after cell values are persisted before mutations. Success is sent only after readback. All Google inputs use RAW values, preventing formula injection. Read-modify-write is rechecked immediately before write; humans editing the same cells concurrently remain an operational limitation (Google Sheets has no compare-and-swap).

AI calls use https://api.openai.com/v1/chat/completions with server-only OPENAI_API_KEY. No AI Gateway credits, Gateway keys, OIDC or Gateway fallback. ACCOUNTING_TEXT_MODEL / ACCOUNTING_VISION_MODEL override ACCOUNTING_MODEL; AI_GATEWAY_MODEL is retained only as a legacy model-name setting (openai/ prefix is removed). Missing keys fail before any request.

Not yet implemented: automatic weekly scheduling, arbitrary existing expense-row corrections, album aggregation, durable retry of crashed model requests. Requests outside supported operations require clarification. Normal staff group membership is the authorization boundary, excluding bots and anonymous senders.

Local verification: TypeScript + Next build and tests/accounting.cjs. Live deployment verification is recorded separately; code deployment alone is not evidence of active Telegram intake.

## Direct OpenAI activation
Add OPENAI_API_KEY as a sensitive Production variable in Vercel and redeploy. Never paste credentials into chat or source. Set ACCOUNTING_MODEL=gpt-6.1-sol or retain the existing model setting. Run the authenticated modeltest action (no ledger writes), then verify a photo end to end. Reconcile current sheet values before recovering saved failures; never bulk-replay manually resolved receipts. OpenAI API billing is separate from ChatGPT subscriptions.

