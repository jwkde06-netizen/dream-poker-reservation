# Sheet-backed weekly settlement

Entry: `/desk/settlement`. Existing active administrator accounts only. The Telegram photo intake remains the existing accounting agent. This page adds weekly review; it does not migrate the ledger.

## Operating flow

1. Pick any date in the week and load the current workbook.
2. Check daily amounts, code payouts, pending messages and source links.
3. Enter salary advance if the selected week's sheet has none (explicit zero when none). This is a report adjustment, not a Sheets write.
4. Save a draft, optionally generate an AI explanation, copy or print the report.
5. After Sunday has ended in Vietnam and all automated flags are resolved, check the review box and confirm. Confirmation is a reviewed report snapshot, not a payment instruction.

The API re-reads the source before saving and rejects a changed hash. Sheets edits after confirmation are detected the next time the week is loaded; there is no continuous Sheets subscription. Human writes are not reversed. Reports are append-only and store the source rows, totals, author and timestamp. AI receives aggregate numbers only, cannot write the ledger or approve a report, and its explanation is a draft (not saved as an authoritative financial amount).

## Calculation

Use calculated cells from `일일 입력` (I:O), rather than copying fee rates into a second engine. Match the existing weekly B6:B12 totals when its B2 week matches. Net here means rakeback less F&B, code payouts and salary advances; unrelated expenses and payment balances are outside this report. Existing partner shares are displayed and negative rounding remainders flagged, never silently corrected. Historic salary is not inferred from another week's B13.

## Configuration and portability

`lib/settlement-profile.ts` owns workbook ID, timezone, tabs, headers and column mapping. The API accepts dates, salary and actions, never user-supplied workbook URLs. This deployment authorizes **Dream only**. Another room requires a reviewed profile plus separate credentials/access or a fully implemented room membership layer before enabling it. Do not expose a room picker and reuse Dream's admin privilege for other rooms. The existing Telegram ingestion still has Dream-specific rules; this change does not claim full multi-tenant onboarding.

## Deployment and checks

Apply `supabase/weekly_reports.sql` once. RLS is enabled and public/authenticated table access is revoked; the authenticated admin API uses the existing service key. No new credential setup is needed. Tests: `tests/settlement.cjs`, `tests/settlement-route.cjs`, plus all existing accounting tests. Existing authenticated ops action `weeklyAudit` is read-only and checks the live sheet totals. No new cron or automatic report delivery is installed by this feature.

## Limits

The workbook must stay under 20,000 rows per source tab; exceeding the limit produces a visible error, not a partial report. Processing history is paged up to 10,000 jobs per week. Pending messages are grouped by receipt timestamp in Vietnam; a late correction for an older business week may need manual review. A snapshot cannot atomically lock human edits in Google Sheets; saved source timestamps/hashes and the next-load change check make this explicit. Authenticated browser interaction and production snapshot writes require a real admin session; automated route tests use mocks and do not imply an end-to-end manager sign-off test.
