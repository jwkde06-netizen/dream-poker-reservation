create table if not exists public.dream_accounting_management_room (
 id boolean primary key default true check(id),
 chat_id text not null unique, title text not null,
 linked_by text not null, created_at timestamptz not null default now()
);
alter table public.dream_accounting_management_room enable row level security;
revoke all on public.dream_accounting_management_room from public,anon,authenticated;
grant select,insert on public.dream_accounting_management_room to service_role;

create table if not exists public.dream_accounting_management_jobs (
 update_id bigint primary key, chat_id text not null, message_id bigint not null,
 sender_id text not null, source_text text not null,
 status text not null default 'received'
  check(status in ('received','done','sending','sent','uncertain')),
 response text, rule_id bigint, reply_id bigint,
 created_at timestamptz not null default now()
);
alter table public.dream_accounting_management_jobs enable row level security;
revoke all on public.dream_accounting_management_jobs from public,anon,authenticated;
grant select,insert,update on public.dream_accounting_management_jobs to service_role;
