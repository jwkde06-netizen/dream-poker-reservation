-- Additive reservation-desk integration. Existing reservation_games.capacity already
-- excludes returning players. No existing bookings are rewritten or fabricated.
create schema if not exists dream_reservation_private;
revoke all on schema dream_reservation_private from public,anon,authenticated;
alter table public.reservation_games add column if not exists desk_carryover_count integer check(desk_carryover_count between 0 and 9);

create table if not exists public.reservation_desk_holds (
 id uuid primary key default gen_random_uuid(),
 game_id uuid not null references public.reservation_games(id),
 label text not null check(label in ('LEE DAE JIN','KIM JEE WEON')),
 status text not null default 'held' check(status in ('held','allocated','released')),
 reservation_id uuid references public.reservations(id),
 created_by text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status='allocated')=(reservation_id is not null))
);
create index if not exists reservation_desk_holds_game on public.reservation_desk_holds(game_id,status);
create unique index if not exists reservation_desk_holds_booking on public.reservation_desk_holds(reservation_id) where reservation_id is not null;
create table if not exists public.reservation_desk_events (
 id bigint generated always as identity primary key,
 game_id uuid not null references public.reservation_games(id),
 action text not null,
 actor text not null,
 source_key text not null,
 detail jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.reservation_desk_commands (
 source_key text primary key,
 actor text not null,
 action jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.reservation_desk_holds enable row level security;
alter table public.reservation_desk_events enable row level security;
alter table public.reservation_desk_commands enable row level security;
revoke all on public.reservation_desk_holds,public.reservation_desk_events,public.reservation_desk_commands from public,anon,authenticated;
grant select,insert,update on public.reservation_desk_holds,public.reservation_desk_commands to service_role;
grant select,insert on public.reservation_desk_events to service_role;
grant usage,select on sequence public.reservation_desk_events_id_seq to service_role;

create or replace function public.dream_reservation_snapshot(p_game_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(x order by x->>'starts_at'),'[]'::jsonb) from (
  select jsonb_build_object('id',g.id,'title',g.title,'table_no',g.table_no,'game_no',g.game_no,
   'starts_at',g.starts_at,'capacity',case when g.desk_carryover_count=9 then 0 else g.capacity end,'is_open',g.is_open,
   'confirmed',(select count(*) from public.reservations r where r.game_id=g.id and r.status in ('confirmed','checked_in')),
   'pending',(select count(*) from public.reservations r where r.game_id=g.id and r.status='pending'),
   'held',(select count(*) from public.reservation_desk_holds h where h.game_id=g.id and h.status='held'),
   'allocated_pending',(select count(*) from public.reservation_desk_holds h join public.reservations r on r.id=h.reservation_id where h.game_id=g.id and h.status='allocated' and r.status='pending'),
   'unheld',case when not g.is_open then 0 else greatest(0,g.capacity-(select count(*) from public.reservations r where r.game_id=g.id and r.status in ('confirmed','checked_in'))-(select count(*) from public.reservation_desk_holds h left join public.reservations r on r.id=h.reservation_id where h.game_id=g.id and (h.status='held' or (h.status='allocated' and r.status='pending')))) end,
   'holds',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'label',h.label,'status',h.status,'reservation_id',h.reservation_id,'player_name',r.player_name) order by h.created_at),'[]'::jsonb) from public.reservation_desk_holds h left join public.reservations r on r.id=h.reservation_id where h.game_id=g.id and h.status<>'released')
  ) x from public.reservation_games g where (p_game_id is null and g.is_open and g.starts_at>now()-interval '36 hours') or g.id=p_game_id
 ) q;
$$;
revoke all on function public.dream_reservation_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.dream_reservation_snapshot(uuid) to service_role;

-- Trigger runs with its owner's visibility so guest/cashier RLS cannot hide holds.
-- It only rejects over-allocation; it never authorizes a write. It is private,
-- has no public EXECUTE grant, and can only run through an already authorized write.
create or replace function dream_reservation_private.capacity_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare cap integer; occupied integer;
begin
 if tg_table_name='reservation_games' then
  if new.desk_carryover_count=9 and new.is_open then raise exception 'reservation_capacity'; end if;
  select count(*) into occupied from public.reservations r where r.game_id=new.id and r.status in ('confirmed','checked_in');
  occupied:=occupied+(select count(*) from public.reservation_desk_holds h left join public.reservations r on r.id=h.reservation_id where h.game_id=new.id and (h.status='held' or (h.status='allocated' and r.status='pending')));
  if new.capacity<occupied then raise exception 'reservation_capacity'; end if;
  return new;
 end if;
 if new.status not in ('confirmed','checked_in') then return new; end if;
 select case when desk_carryover_count=9 then 0 else capacity end into cap from public.reservation_games where id=new.game_id for update;
 select count(*) into occupied from public.reservations r where r.game_id=new.game_id and r.id<>new.id and r.status in ('confirmed','checked_in');
 occupied:=occupied+(select count(*) from public.reservation_desk_holds h left join public.reservations r on r.id=h.reservation_id where h.game_id=new.game_id and (h.status='held' or (h.status='allocated' and r.status='pending' and r.id<>new.id)));
 if occupied>=cap then raise exception 'reservation_capacity'; end if;
 return new;
end $$;
revoke all on function dream_reservation_private.capacity_guard() from public,anon,authenticated;
drop trigger if exists dream_reservation_capacity_guard on public.reservations;
create trigger dream_reservation_capacity_guard before insert or update of game_id,status on public.reservations for each row execute function dream_reservation_private.capacity_guard();
drop trigger if exists dream_reservation_game_capacity_guard on public.reservation_games;
create trigger dream_reservation_game_capacity_guard before update of capacity,is_open,desk_carryover_count on public.reservation_games for each row execute function dream_reservation_private.capacity_guard();

create or replace function dream_reservation_private.release_moved_hold()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.game_id<>new.game_id then
  update public.reservation_desk_holds set status='released',reservation_id=null,updated_at=now() where reservation_id=new.id and game_id<>new.game_id;
 end if;
 return new;
end $$;
revoke all on function dream_reservation_private.release_moved_hold() from public,anon,authenticated;
drop trigger if exists dream_reservation_release_moved_hold on public.reservations;
create trigger dream_reservation_release_moved_hold after update of game_id on public.reservations for each row execute function dream_reservation_private.release_moved_hold();

-- A genuine request from the existing guest/member/desk RPC consumes one desk
-- hold automatically. The guest remains pending until cashier approval.
create or replace function dream_reservation_private.allocate_pending_hold()
returns trigger language plpgsql security definer set search_path='' as $$
declare hid uuid;
begin
 if new.status<>'pending' or current_setting('dream.reservation.explicit_replace',true)='true' then return new; end if;
 perform 1 from public.reservation_games where id=new.game_id for update;
 select id into hid from public.reservation_desk_holds where game_id=new.game_id and status='held' order by created_at,id limit 1 for update;
 if hid is not null then
  update public.reservation_desk_holds set status='allocated',reservation_id=new.id,updated_at=now() where id=hid;
  insert into public.reservation_desk_events(game_id,action,actor,source_key,detail)
   values(new.game_id,'automatic_named_replacement',coalesce(nullif(current_setting('dream.reservation.actor',true),''),'system:existing_booking_flow'),'reservation:'||new.id,
    jsonb_build_object('hold_id',hid,'reservation_id',new.id,'status','pending'));
 end if;
 return new;
end $$;
revoke all on function dream_reservation_private.allocate_pending_hold() from public,anon,authenticated;
drop trigger if exists dream_reservation_allocate_pending_hold on public.reservations;
create trigger dream_reservation_allocate_pending_hold after insert on public.reservations for each row execute function dream_reservation_private.allocate_pending_hold();

-- New/opened empty queues keep two clearly labelled desk holds (three can be
-- chosen by staff). They are deliberately absent from the reservations table.
create or replace function dream_reservation_private.default_desk_holds()
returns trigger language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if not new.is_open or coalesce(new.desk_carryover_count,0)=9 then return new; end if;
 if tg_op='UPDATE' and old.is_open then return new; end if;
 if exists(select 1 from public.reservations where game_id=new.id and status in ('pending','confirmed','checked_in')) then return new; end if;
 if exists(select 1 from public.reservation_desk_holds where game_id=new.id and status='held') then return new; end if;
 for n in 1..least(2,new.capacity) loop
  insert into public.reservation_desk_holds(game_id,label,created_by) values(new.id,case when n=1 then 'LEE DAE JIN' else 'KIM JEE WEON' end,'system:desk_policy');
 end loop;
 insert into public.reservation_desk_events(game_id,action,actor,source_key,detail) values(new.id,'default_desk_holds','system:desk_policy','game:'||new.id||':'||clock_timestamp(),jsonb_build_object('held',least(2,new.capacity),'actual_confirmed_customers',0));
 return new;
end $$;
revoke all on function dream_reservation_private.default_desk_holds() from public,anon,authenticated;
drop trigger if exists dream_reservation_default_holds on public.reservation_games;
create trigger dream_reservation_default_holds after insert or update of is_open on public.reservation_games for each row execute function dream_reservation_private.default_desk_holds();

create or replace function public.dream_reservation_apply(p_action jsonb,p_actor text,p_source text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare k text:=p_action->>'kind'; gid uuid; other_gid uuid; game public.reservation_games;
 hold public.reservation_desk_holds; booking public.reservations; out_result jsonb; old_command public.reservation_desk_commands;
 target integer; held_count integer; occupied integer; pending_count integer; n integer; name_value text; arrival timestamptz;
begin
 if current_user<>'service_role' then raise exception 'reservation_unauthorized'; end if;
 if coalesce(length(p_actor),0)<3 or coalesce(length(p_source),0)<5 or length(p_source)>180 then raise exception 'reservation_actor_required'; end if;
 -- The source lock serializes duplicate Telegram deliveries and double-clicked web requests.
 perform pg_advisory_xact_lock(hashtextextended(p_source,73521));
 select * into old_command from public.reservation_desk_commands where source_key=p_source;
 if found then
  if old_command.actor<>p_actor or old_command.action<>p_action then raise exception 'reservation_source_conflict'; end if;
  return old_command.result||jsonb_build_object('duplicate',true);
 end if;
 if k not in ('holds','carryover','replace','release','book','assign') then raise exception 'reservation_invalid_action'; end if;
 if k in ('replace','release') then
  select game_id into gid from public.reservation_desk_holds where id=(p_action->>'hold_id')::uuid;
  if gid is null then raise exception 'reservation_hold_stale'; end if;
 else gid:=(p_action->>'game_id')::uuid; end if;
 if k='assign' then
  select game_id into other_gid from public.reservations where id=(p_action->>'reservation_id')::uuid;
  if other_gid is null then raise exception 'reservation_booking_missing'; end if;
  perform 1 from public.reservation_games where id in (gid,other_gid) order by id for update;
 end if;
 select * into game from public.reservation_games where id=gid for update;
 if not found then raise exception 'reservation_game_missing'; end if;
 if not game.is_open and k not in ('release','carryover') then raise exception 'reservation_game_closed'; end if;
 if k in ('book','replace') then
  name_value:=btrim(p_action->>'name'); arrival:=(p_action->>'arrival_at')::timestamptz;
  if coalesce(length(name_value),0)<2 or length(name_value)>80 or upper(name_value) in ('LEE DAE JIN','KIM JEE WEON') or arrival is null then raise exception 'reservation_real_name_required'; end if;
  if exists(select 1 from public.reservations where game_id=gid and lower(player_name)=lower(name_value) and status in ('pending','confirmed','checked_in','waitlisted')) then raise exception 'reservation_duplicate_player'; end if;
 end if;
 perform set_config('dream.reservation.actor',p_actor,true);
 perform set_config('dream.reservation.explicit_replace','false',true);
 select count(*) into occupied from public.reservations where game_id=gid and status in ('confirmed','checked_in');
 occupied:=occupied+(select count(*) from public.reservation_desk_holds h join public.reservations r on r.id=h.reservation_id where h.game_id=gid and h.status='allocated' and r.status='pending');
 select count(*) into held_count from public.reservation_desk_holds where game_id=gid and status='held';
 if k='holds' then
  target:=(p_action->>'count')::integer;
  if target is null or target<0 or target>3 then raise exception 'reservation_invalid_hold_count'; end if;
  select count(*) into pending_count from public.reservations where game_id=gid and status in ('pending','confirmed','checked_in');
  if target>held_count and pending_count>0 then raise exception 'reservation_real_queue'; end if;
  if target+occupied>game.capacity then raise exception 'reservation_capacity'; end if;
  if target<held_count then
   update public.reservation_desk_holds set status='released',updated_at=now() where id in (select id from public.reservation_desk_holds where game_id=gid and status='held' order by created_at desc,id limit held_count-target);
  else
   for n in held_count+1..target loop
    insert into public.reservation_desk_holds(game_id,label,created_by) values(gid,case when n%2=1 then 'LEE DAE JIN' else 'KIM JEE WEON' end,p_actor);
   end loop;
  end if;
  out_result:=jsonb_build_object('ok',true,'message',format('데스크 임시 확보 %s석 / Giữ chỗ tạm %s. 실제 고객 확정 아님.',target,target));
 elsif k='carryover' then
  target:=(p_action->>'count')::integer;
  if target is null or target<0 or target>9 then raise exception 'reservation_invalid_carryover'; end if;
  if occupied+held_count>9-target then raise exception 'reservation_capacity'; end if;
  -- capacity=0 cannot be stored in the legacy schema. Close a full-returning game;
  -- retain capacity=1 only as legacy storage, never announce it as available.
  update public.reservation_games set capacity=greatest(1,9-target),desk_carryover_count=target,is_open=(target<9),booking_state=case when target<9 then 'open' else 'closed' end where id=gid;
  out_result:=jsonb_build_object('ok',true,'message',format('TD 연속 참가 %s명 확인 · 신규 %s석 / Khách chơi tiếp %s, còn %s chỗ.',target,9-target,target,9-target));
 elsif k='replace' then
  select * into hold from public.reservation_desk_holds where id=(p_action->>'hold_id')::uuid for update;
  if hold.status<>'held' then raise exception 'reservation_hold_stale'; end if;
  perform set_config('dream.reservation.explicit_replace','true',true);
  insert into public.reservations(game_id,player_name,arrival_at,status,guest_note) values(gid,name_value,arrival,'pending','Desk hold replacement / Thay giữ chỗ tạm') returning * into booking;
  perform set_config('dream.reservation.explicit_replace','false',true);
  update public.reservation_desk_holds set status='allocated',reservation_id=booking.id,updated_at=now() where id=hold.id;
  out_result:=jsonb_build_object('ok',true,'reservation_id',booking.id,'message',format('%s 실명 교체 · 캐셔 승인 대기 / Chờ thu ngân xác nhận.',name_value));
 elsif k='release' then
  select * into hold from public.reservation_desk_holds where id=(p_action->>'hold_id')::uuid for update;
  if hold.status<>'held' then raise exception 'reservation_hold_stale'; end if;
  update public.reservation_desk_holds set status='released',updated_at=now() where id=hold.id;
  out_result:=jsonb_build_object('ok',true,'message','데스크 임시 확보 해제 / Đã bỏ giữ chỗ tạm.');
 elsif k='book' then
  -- Preserve existing cashier-request semantics. This is a request, not confirmation.
  insert into public.reservations(game_id,player_name,arrival_at,status,guest_note) values(gid,name_value,arrival,'pending','Reservation desk / Quầy đặt chỗ') returning * into booking;
  out_result:=jsonb_build_object('ok',true,'reservation_id',booking.id,'message',format('%s 신청 접수 · 캐셔 승인 대기 / Chờ thu ngân xác nhận.',name_value));
 elsif k='assign' then
  select * into booking from public.reservations where id=(p_action->>'reservation_id')::uuid for update;
  if booking.game_id<>other_gid or booking.status not in ('pending','waitlisted','confirmed') then raise exception 'reservation_booking_stale'; end if;
  update public.reservations set game_id=gid where id=booking.id;
  -- A held seat belongs to its game; moving a request must not retain that seat.
  update public.reservation_desk_holds set status='released',reservation_id=null,updated_at=now() where reservation_id=booking.id and game_id<>gid;
  out_result:=jsonb_build_object('ok',true,'reservation_id',booking.id,'message','예약 테이블 변경 / Đã đổi bàn đặt chỗ.');
 end if;
 out_result:=out_result||jsonb_build_object('game_id',gid,'snapshot',public.dream_reservation_snapshot(gid));
 insert into public.reservation_desk_events(game_id,action,actor,source_key,detail) values(gid,k,p_actor,p_source,jsonb_build_object('request',p_action,'result',out_result));
 insert into public.reservation_desk_commands(source_key,actor,action,result) values(p_source,p_actor,p_action,out_result);
 return out_result;
end $$;
revoke all on function public.dream_reservation_apply(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.dream_reservation_apply(jsonb,text,text) to service_role;
