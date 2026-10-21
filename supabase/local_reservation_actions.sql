create table if not exists public.local_reservation_alerts (
  delivery_id text primary key check(delivery_id ~ '^[a-f0-9]{32}:[0-9]{1,6}$'),
  booking_id text not null check(booking_id ~ '^[a-f0-9]{32}$'),
  version integer not null check(version >= 0),
  chat_id bigint not null,
  message_id bigint not null,
  text text not null check(length(text) <= 1800),
  created_at timestamptz not null default now(),
  unique(booking_id,version)
);
create table if not exists public.local_reservation_actions (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null references public.local_reservation_alerts(delivery_id),
  booking_id text not null,
  version integer not null check(version >= 0),
  action text not null check(action in ('confirm','contact')),
  actor_id bigint not null,
  actor_name text not null,
  state text not null default 'pending' check(state in ('pending','done')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique(delivery_id,action)
);
create index if not exists local_reservation_pending on public.local_reservation_actions(created_at) where state='pending';
alter table public.local_reservation_alerts enable row level security;
alter table public.local_reservation_actions enable row level security;
revoke all on public.local_reservation_alerts,public.local_reservation_actions from public,anon,authenticated;
grant select,insert,update on public.local_reservation_alerts,public.local_reservation_actions to service_role;
