-- Canonical operational reservations. Receipt intake and financial tables are untouched.
alter table public.reservation_games add column if not exists is_test boolean not null default false;
alter table public.reservations
 add column if not exists party_size integer not null default 1 check(party_size between 1 and 30),
 add column if not exists request_kind text not null default 'new' check(request_kind in ('new','change','cancel','none')),
 add column if not exists proposed jsonb not null default '{}'::jsonb,
 add column if not exists staff_reply text not null default '' check(length(staff_reply)<=500),
 add column if not exists alternative_at timestamptz,
 add column if not exists source text not null default 'guest' check(source in ('guest','desk')),
 add column if not exists requested_by uuid,
 add column if not exists updated_actor text not null default '',
 add column if not exists is_test boolean not null default false;
update public.reservations set request_kind='none' where status<>'pending';
alter table public.reservation_audit add column if not exists action text,
 add column if not exists details jsonb,
 add column if not exists actor_name text;
alter policy "reservation games public read" on public.reservation_games
 using(not is_test or public.current_app_role() in ('admin','staff','desk','cashier'));

create table reservation_private.commands (
 id uuid primary key, principal text not null, request jsonb not null, response jsonb not null,
 created_at timestamptz not null default now()
);
revoke all on reservation_private.commands from public,anon,authenticated;
alter table reservation_private.commands enable row level security;

