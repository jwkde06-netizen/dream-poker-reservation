# Buy-in Desk follow-up review

Status: code and offline verification complete; not committed, pushed or deployed. No staff-room messages, live ledger writes or model calls were made for testing.

Baseline: production alias was READY at d0c4ab9613697d3697e331642c512563afac6715 (deployment dpl_FDRTbTSEJcCytbMLT85Zuw1TkzXo). Isolated checkout: task-5/buyin-followup, branch fix/bust-followup. No AGENTS.md or .agents/skills files were found in this checkout; docs-accounting-agent.md and buyin audit/reconciliation guidance were read.

## Cause and scope

The handler resolves a reply to the original job, then reloads its photo and runs extraction and roster verification. Missing-roster verification emits the same possible-bust question again. There was no separate state for acknowledged bust-out versus unconfirmed final buy-in total. Direct replies did not follow a completed continuation chain, and unthreaded short Korean/Vietnamese bust replies were not accepted by fallback. The older-context DB lookup also omitted reply_id despite looking up by reply_id.

The exact production update/history was not retrieved: the incident is supported by the parent's observed screenshot and matching source text. A regression run against the untouched production source demonstrates that the confirmation re-enters AI (2 calls); the patched actual-handler replay uses 0 AI calls for confirmation and numeric follow-ups. This is code/fixture evidence, not a replay of private production logs.

## Change

- Typed-by-shape durable phases: awaiting_answer → awaiting_count → confirmed → resolved, scoped to date/game/table/player and original question.
- Bust confirmation records only conversational state, asks only the final cumulative count once, and never changes attendance or counts.
- A correction such as “아직 게임 중” changes the answer state without assuming a count. Repeated identical answers stay silent.
- Explicit 1–50 cumulative numbers continue through the existing plan, conflict checks, serial writer and readback. No new monetary writer was introduced.
- Root question state is persisted; resolved roots have pendingQuestion cleared and resolvedBy recorded. Old replies cannot reopen the question just because later history has fallen outside the recent window.
- Scoped reply chains cannot advance to another player's question. Ambiguous unthreaded answers are not attributed to a player. Unrelated/other-name replies do not change this request.
- Existing update-ID deduplication, locked re-read, bot/sender_chat exclusions remain intact. Legacy photo/registration/correction flows retain their existing behavior.

## Verification

npm run build passed, including npm run test:accounting, npm run test:reservations, TypeScript and Next production build. The new tests run through the real handle() with mock Telegram, DB, Sheets and AI; all external requests are intercepted.

Covered: photo-origin pending question → Korean bust confirmation; Vietnamese confirmation; explicit numeric continuation; mock total 2→3 saved once with webhook redelivery; same answer repeated; original bot reply ID routing; late answer after completion with only durable root retained; another player's question; unrelated text; negative correction; Korean/Vietnamese fallback; multiple-pending ambiguity; bot-origin loop rejection. Existing formula/manual-row/uncertain-write/idempotency suites also pass.

No live post-deployment QA has occurred. Free-form replies outside recognized, unambiguous confirmation/count forms remain conservative and may require an explicit reply/count; this does not claim general language understanding or perfect OCR.

## Existing work preserved

The older new-chat-5/dream-accounting-fix checkout (local/exchange-regression-fix, afc754f) has pre-existing accounting-agent/context/conversation/intake/plan/vision and package changes, plus tests. Read-only comparison found photo/format/verification improvements, not this durable bust-follow-up state. Its owner thread is unknown. No files there were changed. Both patches touch accounting-agent.ts, so do not transplant the old whole file over this production-based patch. Exchange logic and configuration are excluded from this change.

Changed files: lib/accounting-bust-followup.ts (new), lib/accounting-followup.ts, lib/accounting-agent.ts, tests/accounting-request-replay.cjs, this review. Build-only next-env.d.ts changes removed.

## Merge readiness follow-up

Read-only recheck: remote refs/heads/main and production READY alias both remain d0c4ab9613697d3697e331642c512563afac6715. No rebase is required as of this check.

A non-mutating three-way merge comparison used old HEAD afc754f as base, the preserved old worktree file as one side, and the production-based proposed file as the other. It produced 10 accounting-agent.ts conflict blocks: imports/status reporting, extraction prompt, finish/root persistence, confirmed rebuy evidence, chip-verification binding, absent-player question generation, registration isolation, progress reporting, completion/root resolution, and silent-photo error handling. This is not a clean combination of independent features. No combined implementation was accepted; the separate comparison output is ../buyin-merge-review/agent-merge-candidate.txt and contains conflict markers, not deployable code. Existing worktree files were never modified. The narrow production-based fix remains the release candidate.

Precise executed scope: `npm run build` invokes `npm run test:accounting` (14 suite entry files) and `npm run test:reservations` (4 suite entry files), then Next production build including type validation. Thus 18 suite entry files passed, not every test file in the repository (71 .cjs files exist, including runners/helpers). Suite case/assertion counts are not emitted by this custom runner and are not claimed. `node tests/accounting-request-replay.cjs` and `node node_modules/typescript/bin/tsc --noEmit` were also run directly. Final passing build log: ../bust-build-final.log; replay log: ../bust-replay.log. No code changed during this merge-readiness check, so the successful final test results were reused rather than repeated.

Executed accounting suite entries: accounting-staff-learning, accounting-vision, accounting-roster-upgrade, accounting-prewrite-conflict, accounting-cancel-compact, accounting-format, accounting-upgrade-guards, accounting-request-replay, desk-ledger, desk-ledger-inline, desk-ledger-integration, desk-scan-settings, sheet-game-status, settlement-flow. Reservation entries: reservation-operations, reservation-postgres, reservation-webhook, reservation-workflow. PostgreSQL checks run in isolated PGlite, not production.

Not executed: unrelated standalone test files outside these runners; live Telegram webhook delivery; production DB/Sheets mutations; real model/photo inference; live post-deployment staff workflow. No integration candidate containing old pending changes was tested or approved because conflicts were not safely separable within this task.

Migration/permissions: no schema or permission change required by this patch. New conversation fields are nested in the existing dream_accounting_jobs.plan JSONB; existing service_role SELECT/INSERT/UPDATE grants and the existing workbook mutex are reused (supabase/accounting_agent.sql). This is based on repository schema and existing handler usage; live grants were not queried or changed. No migration, new credential, permission grant or deployment was performed.
