# Exchange to Google Sheets

Completed Exchange ledger events are copied to the dedicated private workbook configured by `EXCHANGE_GOOGLE_SPREADSHEET_ID`, using the existing server Google service account. The accounting workbook and its processing code are unchanged.

Only successful ledger receipts enter the Sheets delivery gate. A stable event sequence maps to one sheet row. The exact 18-column header and existing target row are checked before a RAW write, and Google-returned cell values are verified before Telegram receives `완료 ✅`. A lost write response is safe to retry: the same row is checked, not appended twice. Conflicting manual edits stop the write rather than overwrite data. Edited-message warnings and clarification responses remain warnings, not completion receipts.

A temporary owner-issued setup grant can be used on the existing `/exchange` page. Store only its SHA256 hash in `EXCHANGE_SETUP_KEY_HASH` and an explicit expiry in `EXCHANGE_SETUP_EXPIRES_AT`. The grant is limited to initial Exchange connection, disabled outside production, and stops working as soon as a group is bound. It never authorizes ledger reads, admin account changes, or reservation/accounting changes. The URL fragment is removed from the address bar and sent only as a request header. No grant, bot token or service key belongs in Git.

The dedicated bot token and a human group administrator's pairing command are still required. Opening balances must be real and confirmed. Do not create synthetic production transactions for testing. Tests use mocked APIs, and production connection checks inspect only the empty ledger header.
