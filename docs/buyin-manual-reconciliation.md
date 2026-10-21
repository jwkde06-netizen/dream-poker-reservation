# Attendance reconciliation — 2026-10-21

Danny's live sheet corrected game 10 (5-3) to include YANG JUNMO, LEE KWANG TAE and GWON SANG YONG. The next table session, 13-3, is game 11 with CHANG YOON HO, LEE HAE WON and YUN SANG WOO. Earlier bot source 90 incorrectly used game 12 and included two players subsequently removed by staff.

The bot now snapshots observed daily attendance in each job's existing `plan.sheetState`. Stable identity uses business date, table-session label, blind and canonical player, with the current day-wide game number kept separately. Row movement and seat changes do not create another attendance record.

- Reconcile current sheet values before recognition and again before writing. If inputs changed during OCR, recalculate the plan once against the current sheet.
- Preserve manual additions and avoid duplicate rows. A cancellation affects only its game/session; another game's participation is independent.
- Keep removed entries as session-scoped overrides. An old photograph cannot silently restore a player removed by staff. An explicit same-game rejoin, or a short confirmation to the specific attendance question, allows restoration.
- Protect manually corrected buy-in counts against an older source photo. Newly submitted cumulative rebuy snapshots can increase totals normally.
- Follow a historical source's session after manual game renumbering. Do not infer that a new photo is the same game just because its players overlap.
- Legacy initialization requires matching operation provenance; malformed historical row headings alone cannot establish a removal or renumbering.
- Ask only about unresolved attendance while processing independent, certain rows. Successful verified work replies `완료 ✅`, including a photo whose eligible entries already match the sheet.
- Missing from a later photo does not itself cancel an already recorded participation. Moving from a completed game to another table is not a retroactive cancellation.

Verification: existing accounting regression suite and `tests/accounting-reconcile.cjs` pass. Read-only production replay of source 90 planned zero writes and flagged its two removed players in current game 11. Source 95 recognized the three current players at one buy-in each, planned zero writes, and received a verified completion reply (Telegram message 99 replying to 95).

Existing credentials, workbook formulas and reservation/exchange code are preserved. No production financial entries were changed during these tests. A worksheet edit is detected on the next bot request, not through a continuous sheet change subscription. Google Sheets does not expose a cell compare-and-swap here; preflight and readback reduce conflicts but do not make a human edit in the final write interval impossible. A participation change absent from chat, images and the sheet is unobservable. Photograph OCR accuracy remains a separate limitation documented in the earlier audit.
