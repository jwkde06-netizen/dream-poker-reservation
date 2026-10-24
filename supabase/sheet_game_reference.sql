alter table public.dream_sheet_game_status add column source_no text check(source_no is null or source_no ~ '^[0-9]{1,8}$');
alter table public.dream_sheet_game_status drop constraint dream_sheet_game_status_status_check;
alter table public.dream_sheet_game_status add constraint dream_sheet_game_status_status_check check(status in ('active','closed','unconfirmed'));