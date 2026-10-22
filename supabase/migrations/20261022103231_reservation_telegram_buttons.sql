-- Staff-group callbacks run only through the authenticated Telegram webhook.
alter table public.reservations add column contact_required boolean not null default false;
alter table public.reservation_audit add column telegram_actor_id bigint;
alter table public.reservation_audit add column telegram_actor_name text;
alter table public.reservation_audit add column telegram_action text;
alter table reservation_private.outbox add column chat_id text;

create or replace function reservation_private.booking_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status is distinct from old.status then new.contact_required:=false; end if;
 if (new.status,new.game_id,new.arrival_at,new.guest_note,new.player_name,new.player_name_en,new.player_name_ko,new.contact_required)
 is distinct from (old.status,old.game_id,old.arrival_at,old.guest_note,old.player_name,old.player_name_en,old.player_name_ko,old.contact_required) then
  new.version:=old.version+1; new.updated_at:=now();
 else new.version:=old.version; end if;
 return new;
end $$;
create or replace function reservation_private.enqueue_booking() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.reservation_games%rowtype;
begin
 if tg_op='UPDATE' then if new.version=old.version then return new; end if; end if;
 select * into g from public.reservation_games where id=new.game_id;
 insert into reservation_private.outbox(reservation_id,version,payload) values(new.id,new.version,
 jsonb_build_object('reservation_id',new.id,'version',new.version,'event',case when tg_op='INSERT' then 'requested' else 'updated' end,
 'status',new.status,'contact_required',new.contact_required,'player_name',new.player_name,'player_name_en',new.player_name_en,'player_name_ko',new.player_name_ko,
 'arrival_at',new.arrival_at,'guest_note',new.guest_note,'game_title',g.title,'table_no',g.table_no,'game_no',g.game_no));
 begin perform reservation_private.dispatch(); exception when others then null; end;
 return new;
end $$;

-- The desk may confirm the one current Next 5M game before assigning a table.
-- Keep the existing seat lock, capacity check, version check and audit trail.
create or replace function public.review_poker_reservation(p_id uuid,p_status text,p_expected_version integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reservations%rowtype; g public.reservation_games%rowtype; gid uuid;
begin
 if coalesce(public.current_app_role(),'') not in ('admin','staff','desk','cashier') then raise exception 'Staff access required'; end if;
 if p_expected_version is null then raise exception 'Refresh reservation before processing'; end if;
 select game_id into gid from public.reservations where id=p_id;
 select * into g from public.reservation_games where id=gid for update;
 select * into r from public.reservations where id=p_id for update;
 if r.id is null then raise exception 'Reservation not found'; end if;
 if r.game_id<>gid or r.version<>p_expected_version then raise exception 'Another staff member updated this reservation. Refresh and try again.'; end if;
 if r.status=p_status and not r.contact_required then return true; end if;
 if not ((r.status in ('pending','waitlisted') and p_status in ('confirmed','waitlisted','rejected','cancelled')) or (r.status='confirmed' and p_status in ('waitlisted','checked_in','no_show','cancelled')) or (r.status='confirmed' and p_status='confirmed' and r.contact_required)) then raise exception 'This status change is not allowed'; end if;
 if p_status in ('confirmed','checked_in') and (select count(*) from public.reservations where game_id=gid and id<>p_id and status in ('confirmed','checked_in'))>=g.capacity then raise exception 'No seats available. Use the waitlist.'; end if;
 update public.reservations set status=p_status,contact_required=false,reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 insert into public.reservation_audit(reservation_id,previous_status,new_status,actor) values(p_id,r.status,p_status,auth.uid());
 return true;
end $$;

-- Reuse the last delivered message so staff see one up-to-date reservation card.
create or replace function public.claim_reservation_delivery(p_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j reservation_private.outbox%rowtype; previous_message bigint; destination text;
begin
 select * into j from reservation_private.outbox where dispatch_token=p_token for update;
 if j.id is null or j.state in ('sent','failed') or (j.state='sending' and j.lease_until>now()) or j.attempts>=8 then return null; end if;
 if exists(select 1 from reservation_private.outbox where reservation_id=j.reservation_id and version<j.version and state in ('queued','sending')) then return null; end if;
 destination:=coalesce(j.chat_id,public.reservation_telegram_target());
 if destination is null or destination='' then raise exception 'Reservation destination unavailable'; end if;
 select message_id into previous_message from reservation_private.outbox
 where reservation_id=j.reservation_id and version<j.version and state='sent' and chat_id=destination
 order by version desc limit 1;
 update reservation_private.outbox set state='sending',attempts=attempts+1,claim_id=gen_random_uuid(),lease_until=now()+interval '90 seconds',chat_id=destination
 where id=j.id returning * into j;
 return jsonb_build_object('id',j.id,'claim_id',j.claim_id,'payload',j.payload,'target',destination,'message_id',coalesce(j.message_id,previous_message));
end $$;

create function public.reservation_telegram_action_context(p_delivery uuid,p_chat text,p_message bigint)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from reservation_private.outbox o join public.reservations r on r.id=o.reservation_id
 where o.id=p_delivery and o.state='sent' and o.chat_id=p_chat and o.message_id=p_message
 and o.version=r.version and p_chat=public.reservation_telegram_target());
$$;

create function public.apply_reservation_telegram_action(p_delivery uuid,p_chat text,p_message bigint,p_action text,p_actor bigint,p_actor_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reservations%rowtype; g public.reservation_games%rowtype; gid uuid; rid uuid; next_status text;
begin
 if p_action is null or p_action not in ('confirm','contact') or p_actor is null or p_actor<=0 then raise exception 'Invalid staff action'; end if;
 select reservation_id into rid from reservation_private.outbox where id=p_delivery;
 select game_id into gid from public.reservations where id=rid;
 -- Same lock order as web staff review, assignment and booking creation.
 select * into g from public.reservation_games where id=gid for update;
 select * into r from public.reservations where id=rid for update;
 if r.id is null or r.game_id<>gid or not public.reservation_telegram_action_context(p_delivery,p_chat,p_message) then
  return jsonb_build_object('result','stale');
 end if;
 if r.status not in ('pending','waitlisted','confirmed') then return jsonb_build_object('result','inactive'); end if;
 if (p_action='confirm' and r.status='confirmed' and not r.contact_required) or (p_action='contact' and r.contact_required) then return jsonb_build_object('result','unchanged'); end if;
 if p_action='confirm' then
  if not g.is_open then return jsonb_build_object('result','closed'); end if;
  if (select count(*) from public.reservations where game_id=gid and id<>r.id and status in ('confirmed','checked_in'))>=g.capacity then return jsonb_build_object('result','full'); end if;
 end if;
 next_status:=case when p_action='confirm' then 'confirmed' else r.status end;
 update public.reservations set status=next_status,contact_required=(p_action='contact'),reviewed_by=null,reviewed_at=now() where id=r.id;
 insert into public.reservation_audit(reservation_id,previous_status,new_status,telegram_actor_id,telegram_actor_name,telegram_action)
 values(r.id,r.status,next_status,p_actor,left(p_actor_name,100),p_action);
 return jsonb_build_object('result',case when p_action='confirm' then 'confirmed' else 'contact' end);
end $$;
revoke all on function public.reservation_telegram_action_context(uuid,text,bigint),public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) from public,anon,authenticated;
grant execute on function public.reservation_telegram_action_context(uuid,text,bigint),public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) to service_role;
revoke all on function reservation_private.booking_version(),reservation_private.enqueue_booking() from public,anon,authenticated;

-- Keep the existing lookup API and add the contact flag for guests without login.
drop function public.lookup_named_poker_reservation(uuid);
create function public.lookup_named_poker_reservation(p_token uuid)
returns table(reservation_id uuid,game_id uuid,game_title text,player_name text,arrival_at timestamptz,status text,created_at timestamptz,player_name_en text,player_name_ko text,contact_required boolean)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.id,r.game_id,g.title,r.player_name,r.arrival_at,r.status,r.created_at,r.player_name_en,r.player_name_ko,r.contact_required
 from public.reservations r join public.reservation_games g on g.id=r.game_id where r.lookup_token=p_token;
$$;
revoke all on function public.lookup_named_poker_reservation(uuid) from public;
grant execute on function public.lookup_named_poker_reservation(uuid) to anon,authenticated;

-- A retry of an existing message must retain its receipt even if Telegram is down.
do $receipt$
declare source text; updated text;
begin
 select pg_get_functiondef('public.finish_reservation_delivery(uuid,uuid,bigint,text)'::regprocedure) into source;
 updated:=replace(source,'message_id=p_message_id','message_id=coalesce(p_message_id,message_id)');
 if updated=source then raise exception 'Delivery receipt function changed; inspect before applying'; end if;
 execute updated;
end $receipt$;
