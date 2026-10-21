create table if not exists public.dream_accounting_jobs (
 update_id bigint primary key, message_id bigint not null, sender_id text not null,
 text text not null, status text not null default 'received', image_key text,
 source_message jsonb, plan jsonb, reply_text text, reply_id bigint, failure_reason text,
 created_at timestamptz not null default now()
);
alter table public.dream_accounting_jobs enable row level security;
revoke all on public.dream_accounting_jobs from public, anon, authenticated;
grant select,insert,update on public.dream_accounting_jobs to service_role;
create index if not exists dream_accounting_image on public.dream_accounting_jobs(image_key) where status='applied';
create table if not exists public.dream_accounting_mutex (id boolean primary key default true check(id), owner uuid, acquired_at timestamptz);
insert into public.dream_accounting_mutex(id) values(true) on conflict do nothing;
alter table public.dream_accounting_mutex enable row level security;
revoke all on public.dream_accounting_mutex from public, anon, authenticated;
grant select,update on public.dream_accounting_mutex to service_role;
create or replace function public.dream_accounting_acquire(p_owner uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.dream_accounting_mutex set owner=p_owner,acquired_at=now() where id=true and owner is null;
 return found;
end;$$;
create or replace function public.dream_accounting_release(p_owner uuid) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.dream_accounting_mutex set owner=null,acquired_at=null where id=true and owner=p_owner;
 return found;
end;$$;
revoke all on function public.dream_accounting_acquire(uuid),public.dream_accounting_release(uuid) from public,anon,authenticated;
grant execute on function public.dream_accounting_acquire(uuid),public.dream_accounting_release(uuid) to service_role;

-- Idempotent upgrade for installations created before source retention.
alter table public.dream_accounting_jobs add column if not exists source_message jsonb;
