alter table public.reservation_games add column if not exists continuing_count integer not null default 0 check (continuing_count>=0);
alter table public.reservation_games add column if not exists level4_at timestamptz;
alter table public.reservations add column if not exists desk_kind text not null default 'player' check (desk_kind in ('player','hold'));
alter table public.reservations add column if not exists hold_owner text;
alter table public.reservations add column if not exists agent_code text;
create table public.desk_events (
 id uuid primary key default gen_random_uuid(),reservation_id uuid references public.reservations(id),game_id uuid references public.reservation_games(id),
 action text not null,actor text not null,detail jsonb not null default '{}',created_at timestamptz not null default now(),
 delivered_at timestamptz,attempts integer not null default 0,last_error text,lease_until timestamptz
);
alter table public.desk_events enable row level security;
revoke all on public.desk_events from anon,authenticated;
grant select on public.desk_events to authenticated;
grant all on public.desk_events to service_role;
create policy desk_events_staff_read on public.desk_events for select to authenticated using (public.current_app_role() in ('admin','staff'));
create or replace function public.desk_action(p_game uuid,p_action text,p_id uuid default null,p_target uuid default null,p_name text default null,p_code text default null,p_count integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare g public.reservation_games%rowtype;r public.reservations%rowtype;t public.reservations%rowtype;rid uuid;n int;a text;
begin
 if auth.uid() is null or coalesce(public.current_app_role(),'') not in ('admin','staff') then raise exception 'Staff login required'; end if;
 a:='web:'||auth.uid();
 select * into g from public.reservation_games where id=p_game for update;
 if not found then raise exception 'Game not found'; end if;
 if not g.is_open and p_action not in ('cancel','reject') then raise exception 'Game is closed'; end if;
 if p_action='level4' then
  if p_count is null or p_count<0 or p_count>g.capacity then raise exception 'Invalid continuing count'; end if;
  select count(*) into n from public.reservations where game_id=p_game and status in ('confirmed','checked_in');
  if p_count+n>g.capacity then raise exception 'Continuing players plus reservations exceed capacity'; end if;
  update public.reservation_games set continuing_count=p_count,level4_at=now() where id=p_game;
  insert into public.desk_events(game_id,action,actor,detail) values(p_game,'level4',a,jsonb_build_object('continuing',p_count,'available',g.capacity-p_count-n));
  return p_game;
 elsif p_action='hold' then
  if p_name is null or p_name not in ('LEE DAE JIN','KIM JEE WEON') then raise exception 'Select a manager'; end if;
  if length(trim(coalesce(p_code,''))) not between 1 and 40 then raise exception 'Agent code required'; end if;
  select count(*) into n from public.reservations where game_id=p_game and (status in ('confirmed','checked_in') or (desk_kind='hold' and status='pending'));
  if n+g.continuing_count>=g.capacity then raise exception 'No unrequested seats remain'; end if;
  insert into public.reservations(game_id,player_name,arrival_at,desk_kind,hold_owner,agent_code,note) values(p_game,p_name,g.starts_at,'hold',p_name,trim(p_code),'[DESK HOLD]') returning id into rid;
 elsif p_action='replace' then
  select * into r from public.reservations where id=p_id and game_id=p_game for update;
  select * into t from public.reservations where id=p_target and game_id=p_game for update;
  if r.id is null or r.desk_kind<>'hold' or r.status<>'confirmed' then raise exception 'Confirmed hold required'; end if;
  if t.id is null or t.desk_kind<>'player' or t.status not in ('pending','waitlisted') then raise exception 'Select a pending player in the same game'; end if;
  update public.reservations set status='cancelled',updated_at=now() where id=r.id;
  update public.reservations set status='confirmed',hold_owner=r.hold_owner,agent_code=r.agent_code,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=t.id;
  insert into public.desk_events(reservation_id,game_id,action,actor,detail) values(t.id,p_game,'replace',a,jsonb_build_object('hold_id',r.id,'from',r.player_name,'to',t.player_name));
  return t.id;
 else
  select * into r from public.reservations where id=p_id and game_id=p_game for update;
  if not found then raise exception 'Reservation not found'; end if;
  if p_action='confirm' and r.status not in ('pending','waitlisted') then raise exception 'Already processed'; end if;
  if p_action='checkin' and (r.status<>'confirmed' or r.desk_kind='hold') then raise exception 'Confirmed player required'; end if;
  if p_action in ('cancel','reject','wait') and r.status not in ('pending','waitlisted','confirmed') then raise exception 'Already processed'; end if;
  if p_action not in ('confirm','checkin','cancel','reject','wait') then raise exception 'Invalid action'; end if;
  update public.reservations set status=case p_action when 'confirm' then 'confirmed' when 'checkin' then 'checked_in' when 'cancel' then 'cancelled' when 'reject' then 'rejected' else 'waitlisted' end,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=p_id;
  rid:=p_id;
 end if;
 insert into public.desk_events(reservation_id,game_id,action,actor,detail) values(rid,p_game,p_action,a,jsonb_build_object('name',coalesce(p_name,r.player_name),'agent_code',coalesce(p_code,r.agent_code)));
 return rid;
end $$;
revoke all on function public.desk_action(uuid,text,uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.desk_action(uuid,text,uuid,uuid,text,text,integer) to authenticated;
create or replace function public.desk_capacity_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare cap int;c int;n int;
begin
 if new.status in ('confirmed','checked_in') then
  select capacity,continuing_count into cap,c from public.reservation_games where id=new.game_id for update;
  select count(*) into n from public.reservations where game_id=new.game_id and id<>new.id and status in ('confirmed','checked_in');
  if n+c>=cap then raise exception 'Game capacity exceeded'; end if;
  if new.desk_kind='hold' and new.status='checked_in' then raise exception 'Assign a real player before check-in'; end if;
 end if;
 return new;
end $$;
revoke all on function public.desk_capacity_guard() from public,anon,authenticated;
create trigger desk_capacity_guard before insert or update on public.reservations for each row execute function public.desk_capacity_guard();
create or replace function public.desk_capture_booking() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.desk_kind='player' then
 insert into public.desk_events(reservation_id,game_id,action,actor,detail) values(new.id,new.game_id,'booking',coalesce('web:'||auth.uid(),'guest'),jsonb_build_object('name',new.player_name));
 end if;
 return new;
end $$;
revoke all on function public.desk_capture_booking() from public,anon,authenticated;
create trigger desk_capture_booking after insert on public.reservations for each row execute function public.desk_capture_booking();
create or replace function public.desk_claim_events() returns setof public.desk_events language sql security invoker set search_path=public as $$
 update public.desk_events set lease_until=now()+interval '2 minutes',attempts=attempts+1 where id in
 (select id from public.desk_events where delivered_at is null and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 20) returning *;
$$;
revoke all on function public.desk_claim_events() from public,anon,authenticated;
grant execute on function public.desk_claim_events() to service_role;
create or replace function public.desk_telegram_decide(p_id uuid,p_status text,p_actor text) returns text language plpgsql security invoker set search_path=public as $$
declare gid uuid;r public.reservations%rowtype;
begin
 if p_status not in ('confirmed','rejected','waitlisted') then raise exception 'Invalid status'; end if;
 select game_id into gid from public.reservations where id=p_id;
 if gid is null then return 'missing'; end if;
 perform 1 from public.reservation_games where id=gid and is_open for update;
 if not found then return 'closed'; end if;
 select * into r from public.reservations where id=p_id for update;
 if r.status not in ('pending','waitlisted') then return 'already_'||r.status; end if;
 update public.reservations set status=p_status,reviewed_at=now(),updated_at=now() where id=p_id;
 insert into public.desk_events(reservation_id,game_id,action,actor,detail) values(p_id,gid,p_status,p_actor,jsonb_build_object('name',r.player_name));
 return p_status;
end $$;
revoke all on function public.desk_telegram_decide(uuid,text,text) from public,anon,authenticated;
grant execute on function public.desk_telegram_decide(uuid,text,text) to service_role;
-- Guest-facing availability includes continuing players and approved holds.
create or replace function public.reservation_public_stats()
returns table(game_id uuid,confirmed_count bigint,pending_count bigint,waiting_count bigint)
language sql stable security definer set search_path=public as $$
 select g.id,g.continuing_count+(select count(*) from public.reservations r where r.game_id=g.id and r.status in ('confirmed','checked_in')),
 (select count(*) from public.reservations r where r.game_id=g.id and r.status='pending'),
 (select count(*) from public.reservations r where r.game_id=g.id and r.status='waitlisted')
 from public.reservation_games g where g.is_open and g.starts_at>now()-interval '12 hours';
$$;
