create table public.dream_sheet_game_status (
 business_date date not null, game_no integer not null check(game_no>0),
 table_label text not null, physical_table text not null, blind text not null,
 status text not null check(status in ('active','closed')),
 version uuid not null default gen_random_uuid(), updated_at timestamptz not null default now(),
 updated_by uuid, history jsonb not null default '[]'::jsonb,
 primary key(business_date,game_no)
);
create unique index dream_sheet_one_live_table on public.dream_sheet_game_status(business_date,physical_table) where status='active';
alter table public.dream_sheet_game_status enable row level security;
revoke all on public.dream_sheet_game_status from anon, authenticated;
grant select,insert,update on public.dream_sheet_game_status to service_role;