begin;
create table public.dream_exchange_connection (
  id boolean primary key default true check(id),
  bot_id text not null check(bot_id ~ '^[0-9]+$'),
  username text not null check(username='dream_poker_exchange_bot'),
  encrypted_credentials text not null,
  chat_id text check(chat_id ~ '^-[0-9]+$'),
  chat_title text,
  admin_ids text[] not null default '{}',
  activated_at timestamptz not null default now(),
  enabled boolean not null default false,
  webhook_verified boolean not null default false,
  pair_hash text check(pair_hash ~ '^[a-f0-9]{64}$'),
  pair_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.dream_exchange_connection enable row level security;
revoke all on public.dream_exchange_connection from public,anon,authenticated;
grant select,insert,update on public.dream_exchange_connection to service_role;
create function public.dream_exchange_bind_room(p_hash text,p_chat_id text,p_chat_title text,p_admin_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.dream_exchange_connection;
begin
  if p_hash is null or p_chat_id is null or p_admin_id is null or p_chat_title is null or p_chat_id !~ '^-[0-9]+$' or p_admin_id !~ '^[0-9]+$' or length(p_chat_title)>200 then raise exception 'Invalid room'; end if;
  select * into strict r from public.dream_exchange_connection where id for update;
  if r.chat_id is not null or r.pair_hash is null or r.pair_hash<>p_hash or r.pair_expires_at is null or r.pair_expires_at<=now() or not r.webhook_verified then return false; end if;
  update public.dream_exchange_connection set chat_id=p_chat_id,chat_title=p_chat_title,admin_ids=array[p_admin_id],activated_at=now(),enabled=true,pair_hash=null,pair_expires_at=null,updated_at=now() where id;
  return true;
end;
$$;
revoke all on function public.dream_exchange_bind_room(text,text,text,text) from public,anon,authenticated;
grant execute on function public.dream_exchange_bind_room(text,text,text,text) to service_role;
commit;
