# Scan → daily → weekly

The administrator solution uses one business date across game entry, daily settlement and weekly review. Game links retain the internal game number; the printed K-holdem No. remains separate. No new scheduled job or ledger write is triggered by opening a page.

Daily and weekly views use the same calculated Sheet cells. Daily net is rakeback less deductible F&B and code payouts, before weekly salary. 3F F&B is shown separately. The seven daily nets minus weekly salary must equal the weekly net. Invalid source amounts are flagged, and daily headline totals are withheld while the day's source data needs correction.

Receipt status groups follow-up/retry chains, excludes explicitly superseded requests, and compares proposed attendance with current ledger rows. An applied log alone is not proof that the current Sheet still matches. An unresolved named player continues to require review even when the verified participants have been entered. Failed logs whose exact attendance is now present can be shown as verified. F&B relies on its existing applied write audit because equal totals are not a stable expense identity.

Journal reads are paged, bounded at 10,000 entries, and include the following day for overnight receipt uploads; operation dates determine the business day. Corrections arriving more than a day after the week ended are outside this bounded scan and still require explicit review. The existing weekly sign-off remains a reviewed snapshot, not payment or a claim that unsubmitted receipts do not exist.

Verification: `tests/settlement-flow.cjs`, `tests/settlement.cjs`, `tests/settlement-route.cjs`, and the accounting offline suite. Browser checks must cover scan queue → dated daily report → matching week → a dated game link. Do not submit a live weekly confirmation or replay staff photos merely to test this flow.
