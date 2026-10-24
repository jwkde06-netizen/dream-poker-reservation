-- A scanned roster is not evidence that play has started.
-- Keep state changes in the authenticated ledger handler with version/audit guards.
alter table public.dream_sheet_game_status
  drop constraint dream_sheet_game_status_status_check,
  add constraint dream_sheet_game_status_status_check
    check (status in ('unconfirmed', 'prepared', 'active', 'closed'));
