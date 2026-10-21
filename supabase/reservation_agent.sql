-- Deploy before the application. Enable dispatch separately after worker verification.
create schema if not exists reservation_private;
revoke all on schema reservation_private from public, anon, authenticated;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
alter table public.user_profiles drop constraint user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check check(role in ('admin','staff','agent','pending','desk','cashier'));
alter table public.reservations add column if not exists version integer not null default 0;
alter policy "reservation cashier read" on public.reservations using (public.current_app_role() in ('admin','staff','desk','cashier'));
alter policy "reservation audit manager read" on public.reservation_audit using (public.current_app_role() in ('admin','staff','desk','cashier'));
alter policy "reservation staff message read" on public.reservation_messages using (public.current_app_role() in ('admin','staff','desk','cashier'));
alter policy "reservation staff message send" on public.reservation_messages with check (public.current_app_role() in ('admin','staff','desk','cashier') and author_id=auth.uid());
-- Extend only reservation entry permissions, leaving shared financial roles untouched.
do $roles$ declare f record; begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname='desk_request_poker_reservation' loop
 execute replace(pg_get_functiondef(f.oid),$$('admin','staff')$$,$$('admin','staff','desk','cashier')$$);
 end loop;
end $roles$;

create or replace function public.review_poker_reservation(p_id uuid,p_status text,p_expected_version integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reservations%rowtype; g public.reservation_games%rowtype; gid uuid;
begin
 if public.current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff access required'; end if;
 if p_expected_version is null then raise exception 'Refresh reservation before processing'; end if;
 select game_id into gid from public.reservations where id=p_id;
 select * into g from public.reservation_games where id=gid for update;
 select * into r from public.reservations where id=p_id for update;
 if r.id is null then raise exception 'Reservation not found'; end if;
 if r.game_id<>gid or r.version<>p_expected_version then raise exception 'Another staff member updated this reservation. Refresh and try again.'; end if;
 if r.status=p_status then return true; end if;
 if not ((r.status in ('pending','waitlisted') and p_status in ('confirmed','waitlisted','rejected','cancelled')) or (r.status='confirmed' and p_status in ('waitlisted','checked_in','no_show','cancelled'))) then raise exception 'This status change is not allowed'; end if;
 if p_status in ('confirmed','checked_in') and (select count(*) from public.reservations where game_id=gid and id<>p_id and status in ('confirmed','checked_in'))>=g.capacity then raise exception 'No seats available. Use the waitlist.'; end if;
 update public.reservations set status=p_status,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 insert into public.reservation_audit(reservation_id,previous_status,new_status,actor) values(p_id,r.status,p_status,auth.uid());
 return true;
end $$;
create or replace function public.assign_poker_reservation(p_id uuid,p_game uuid,p_expected_version integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reservations%rowtype; g public.reservation_games%rowtype; gid uuid;
begin
 if public.current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff access required'; end if;
 select game_id into gid from public.reservations where id=p_id;
 -- All operations that take a game and booking lock use this ordering.
 perform id from public.reservation_games where id in (gid,p_game) order by id for update;
 select * into r from public.reservations where id=p_id for update;
 if r.id is null then raise exception 'Reservation not found'; end if;
 if p_expected_version is null or r.version<>p_expected_version or r.game_id<>gid then raise exception 'Reservation changed. Refresh and try again.'; end if;
 if r.status not in ('pending','waitlisted','confirmed') then raise exception 'This reservation cannot be reassigned'; end if;
 if gid=p_game then return true; end if;
 select * into g from public.reservation_games where id=p_game and is_open;
 if g.id is null then raise exception 'Target game is closed'; end if;
 if exists(select 1 from public.reservations where game_id=p_game and id<>p_id and lower(player_name)=lower(r.player_name) and status in ('pending','confirmed','waitlisted','checked_in')) then raise exception 'Player already has a reservation for this game'; end if;
 if r.status='confirmed' and (select count(*) from public.reservations where game_id=p_game and status in ('confirmed','checked_in'))>=g.capacity then raise exception 'Target game is full'; end if;
 update public.reservations set game_id=p_game,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 insert into public.reservation_audit(reservation_id,previous_status,new_status,actor) values(p_id,r.status,r.status,auth.uid());
 return true;
end $$;
revoke all on function public.review_poker_reservation(uuid,text,integer),public.assign_poker_reservation(uuid,uuid,integer) from public,anon;
grant execute on function public.review_poker_reservation(uuid,text,integer),public.assign_poker_reservation(uuid,uuid,integer) to authenticated;

create table reservation_private.settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into reservation_private.settings(id) values(true);
create table reservation_private.outbox(
 id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id) on delete cascade,
 version integer not null, payload jsonb not null, dispatch_token uuid not null unique default gen_random_uuid(),
 state text not null default 'queued' check(state in ('queued','sending','sent','failed')),
 attempts integer not null default 0, dispatch_attempts integer not null default 0,
 claim_id uuid, lease_until timestamptz, next_attempt_at timestamptz not null default now(),
 last_error text, message_id bigint, created_at timestamptz not null default now(),sent_at timestamptz,
 unique(reservation_id,version)
);
alter table reservation_private.settings enable row level security;
alter table reservation_private.outbox enable row level security;
create index reservation_outbox_due on reservation_private.outbox(next_attempt_at) where state in ('queued','sending');
create index reservation_outbox_order on reservation_private.outbox(reservation_id,version,state);

create or replace function reservation_private.booking_version() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (new.status,new.game_id,new.arrival_at,new.guest_note,new.player_name) is distinct from (old.status,old.game_id,old.arrival_at,old.guest_note,old.player_name) then
 new.version:=old.version+1; new.updated_at:=now();
 else new.version:=old.version; end if;
 return new;
end $$;
create trigger reservation_version before update on public.reservations for each row execute function reservation_private.booking_version();
create or replace function reservation_private.enqueue_booking() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.reservation_games%rowtype;
begin
 if tg_op='UPDATE' then if new.version=old.version then return new; end if; end if;
 select * into g from public.reservation_games where id=new.game_id;
 insert into reservation_private.outbox(reservation_id,version,payload) values(new.id,new.version,
 jsonb_build_object('reservation_id',new.id,'version',new.version,'event',case when tg_op='INSERT' then 'requested' else 'updated' end,'status',new.status,'player_name',new.player_name,'arrival_at',new.arrival_at,'guest_note',new.guest_note,'game_title',g.title,'table_no',g.table_no,'game_no',g.game_no));
 -- Dispatch immediately when enabled; the persisted queue survives network scheduling failures.
 begin perform reservation_private.dispatch(); exception when others then null; end;
 return new;
end $$;
create trigger reservation_outbox after insert or update on public.reservations for each row execute function reservation_private.enqueue_booking();

create or replace function public.claim_reservation_delivery(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j reservation_private.outbox%rowtype;
begin
 select * into j from reservation_private.outbox where dispatch_token=p_token for update;
 if j.id is null or j.state in ('sent','failed') or (j.state='sending' and j.lease_until>now()) or j.attempts>=8 then return null; end if;
 if exists(select 1 from reservation_private.outbox where reservation_id=j.reservation_id and version<j.version and state in ('queued','sending')) then return null; end if;
 update reservation_private.outbox set state='sending',attempts=attempts+1,claim_id=gen_random_uuid(),lease_until=now()+interval '90 seconds' where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'claim_id',j.claim_id,'payload',j.payload,'target',public.reservation_telegram_target());
end $$;
create or replace function public.finish_reservation_delivery(p_id uuid,p_claim uuid,p_message_id bigint default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare j reservation_private.outbox%rowtype;
begin
 select * into j from reservation_private.outbox where id=p_id for update;
 if j.id is null or j.state<>'sending' or j.claim_id is distinct from p_claim then return false; end if;
 update reservation_private.outbox set state=case when p_message_id is not null then 'sent' when attempts>=8 then 'failed' else 'queued' end,
 sent_at=case when p_message_id is not null then now() end,message_id=p_message_id,last_error=left(p_error,300),
 next_attempt_at=now()+make_interval(secs=>least(900,30*power(2,least(attempts,5)))::integer),lease_until=null,claim_id=null where id=p_id;
 return true;
end $$;
revoke all on function public.claim_reservation_delivery(uuid),public.finish_reservation_delivery(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_reservation_delivery(uuid),public.finish_reservation_delivery(uuid,uuid,bigint,text) to service_role;

create or replace function reservation_private.dispatch() returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare j reservation_private.outbox%rowtype; n integer:=0;
begin
 if not (select enabled from reservation_private.settings where id) then return 0; end if;
 for j in select o.* from reservation_private.outbox o where state in ('queued','sending') and next_attempt_at<=now() and (lease_until is null or lease_until<=now()) and not exists(select 1 from reservation_private.outbox p where p.reservation_id=o.reservation_id and p.version<o.version and p.state in ('queued','sending')) order by created_at limit 20 for update skip locked loop
 if j.dispatch_attempts>=12 or j.attempts>=8 then
 update reservation_private.outbox set state='failed',last_error=coalesce(last_error,'Delivery worker did not acknowledge. Check server configuration.') where id=j.id;
 else
 -- A scoped, per-job token only; never place a bot token or service key in pg_net.
 perform net.http_post(url:='https://dream-poker-reservation.vercel.app/api/reservation-agent/deliver',body:=jsonb_build_object('notification_token',j.dispatch_token),timeout_milliseconds:=20000);
 update reservation_private.outbox set dispatch_attempts=dispatch_attempts+1,next_attempt_at=now()+interval '2 minutes' where id=j.id;
 n:=n+1;
 end if;
 end loop;
 return n;
end $$;

create or replace function public.reservation_agent_status() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff access required'; end if;
 return jsonb_build_object('enabled',(select enabled from reservation_private.settings where id),'queued',(select count(*) from reservation_private.outbox where state in ('queued','sending')),'failed',(select count(*) from reservation_private.outbox where state='failed'),'pending',(select count(*) from public.reservations where status='pending'),'overdue',(select count(*) from public.reservations where status='pending' and created_at<now()-interval '15 minutes'),'jobs',(select coalesce(jsonb_agg(x),'[]') from (select id,reservation_id,state,attempts,last_error,created_at,sent_at from reservation_private.outbox order by (state='failed') desc,created_at desc limit 30)x));
end $$;
create or replace function public.retry_reservation_delivery(p_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff access required'; end if;
 update reservation_private.outbox set state='queued',attempts=0,dispatch_attempts=0,next_attempt_at=now(),lease_until=null,claim_id=null,dispatch_token=gen_random_uuid(),last_error=null where id=p_id and state='failed';
 return found;
end $$;
revoke all on function public.reservation_agent_status(),public.retry_reservation_delivery(uuid) from public,anon;
grant execute on function public.reservation_agent_status(),public.retry_reservation_delivery(uuid) to authenticated;
revoke all on all functions in schema reservation_private from public,anon,authenticated;
