create table if not exists public.dream_weekly_reports (
 id uuid primary key default gen_random_uuid(),
 room_id text not null check (room_id='dream'),
 week_start date not null, week_end date not null,
 status text not null check(status in ('draft','confirmed')),
 source_hash text not null check(length(source_hash)=64),
 snapshot jsonb not null, report_text text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 check(week_end=week_start+6),
 unique(room_id,week_start,source_hash,status)
);
alter table public.dream_weekly_reports enable row level security;
revoke all on public.dream_weekly_reports from public,anon,authenticated;
grant select,insert on public.dream_weekly_reports to service_role;
revoke update,delete,truncate,references,trigger on public.dream_weekly_reports from service_role;
-- Append-only versions. Financial source remains Google Sheets.
