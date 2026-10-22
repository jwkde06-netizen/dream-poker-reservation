create table public.dream_cashier_reviews (
 id uuid primary key default gen_random_uuid(),
 source_id text not null,
 input_hash text not null,
 created_by text not null,
 input jsonb not null,
 source_hash text not null,
 review jsonb not null,
 created_at timestamptz not null default now(),
 unique(source_id,input_hash,source_hash)
);
alter table public.dream_cashier_reviews enable row level security;
revoke all on public.dream_cashier_reviews from public,anon,authenticated;
grant select,insert on public.dream_cashier_reviews to service_role;
