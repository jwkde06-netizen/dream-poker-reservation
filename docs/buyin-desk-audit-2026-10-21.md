# Dream Buy-in Desk audit — 2026-10-21

Requested review window: 11:30–12:00 UTC. Sources: Dream Staff (-5322020390), stored Telegram jobs, player master, daily input and F&B tabs. Business rows were not replayed for evaluation. Normal live staff requests continued during the review.

## Changes deployed

- Retain the original photo, pending question, and staff answers across follow-ups. Preserve explicit codes without asking for optional card numbers.
- Register a named new player and their explicitly supplied, existing agency code in the same planned batch as the buy-in. Never infer agency from nationality or replace an existing nonempty agency.
- Supply structured game objects to the recognizer; distinguish global game numbers from physical table/session labels.
- Resolve a rebuy snapshot as one existing game and use cumulative chip totals. Literal staff chip amounts and F&B floor/amount override conflicting extraction. Older snapshots cannot reduce current buy-ins.
- Match unambiguous spacing variants; retain distinct people such as KIM HYUNG WOON and KIM HYUNG WOOK.
- Preserve one blank row between games, one number heading per game, and formula spill columns. Late arrivals can be inserted into the original game while preserving following business inputs.
- Block all affected game writes when the recognizer is still asking about game/date/table identity. Partial execution remains possible for unrelated certain entries.
- Save scoped printed-number corrections (2026-10-21: T13 printed 8→game 7, T12 printed 9→game 8), the verified CHANG alias, and F&B floor precedence.
- Apply the staff's new paper-only roster rule (message 92); phone/app screenshots are excluded.
- Successful live replies remain `완료 ✅` after write readback.

## Verification

- TypeScript check and accounting regression suite passed, including formula-column protection, aliases, cumulative arithmetic, follow-up selection, explicit-code registration, moved-row preservation and uncertain-game boundaries.
- Read-only live recognition: game 8 six-player roster and game 9 roster matched existing records with no duplicate plan; game 7 rebuy fixture produced totals 2/1/4; F&B message 82 produced 3F and 70,000 VND without a background-receipt question.
- Live staff message 88 successfully continued message 86 and added YANG JUNMO for game 10.
- Webhook/admin visibility, Google formula anchors and database connectivity verified; webhook pending count was zero.
- Stronger-model experiment received Gateway HTTP 403. It was reverted to the authorized gpt-5-mini model; photos now use high detail and medium reasoning. No authentication/access controls were changed.

## Remaining review items

The skewed game-6 paper receipt (message 50) remains a failed vision regression: CHANG YOON HO has 200,000 chips / 2 buy-ins, but high-detail medium reasoning returned 100,000 / 1 in the read-only pre-rebuy fixture. No sheet write occurred during that evaluation. Do not report unrestricted photo accuracy as verified.

Before the new uncertainty guard, message 90 wrote a T13 roster under game 12 while still asking whether printed No.12 was the actual game number. Rows 2115:2119 retained that number at the last audit read. Do not infer the intended number or silently rewrite it; obtain the final printed roster/correction. Tests do not establish perfect accuracy on every future photo.

Regression commands:

```sh
npx tsc --noEmit
npx tsc lib/accounting-plan.ts lib/accounting-memory.ts lib/accounting-context.ts lib/accounting-followup.ts lib/accounting-regressions.ts --outDir .test-build --module commonjs --target es2020 --skipLibCheck
node tests/accounting.cjs
```
