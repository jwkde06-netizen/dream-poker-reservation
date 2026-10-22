create or replace function public.apply_reservation_telegram_action(p_delivery uuid,p_chat text,p_message bigint,p_action text,p_actor bigint,p_actor_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.reservations%rowtype; g public.reservation_games%rowtype; gid uuid; rid uuid; next_status text;
begin
 if p_action is null or p_action not in ('confirm','contact','cancel') or p_actor is null or p_actor<=0 then raise exception 'Invalid staff action'; end if;
 select reservation_id into rid from reservation_private.outbox where id=p_delivery;
 select game_id into gid from public.reservations where id=rid;
 -- Same lock order as web staff review, assignment and booking creation.
 select * into g from public.reservation_games where id=gid for update;
 select * into r from public.reservations where id=rid for update;
 if r.id is null or r.game_id<>gid or not public.reservation_telegram_action_context(p_delivery,p_chat,p_message) then
  return jsonb_build_object('result','stale');
 end if;
 if r.status not in ('pending','waitlisted','confirmed') then return jsonb_build_object('result','inactive'); end if;
 -- Explicit cancel prevents a replayed CONFIRM callback from cancelling a reservation.
 if p_action='cancel' and r.status<>'confirmed' then return jsonb_build_object('result','inactive'); end if;
 if (p_action='confirm' and r.status='confirmed' and not r.contact_required) or (p_action='contact' and r.contact_required) then return jsonb_build_object('result','unchanged'); end if;
 if p_action='confirm' then
  if not g.is_open then return jsonb_build_object('result','closed'); end if;
  if (select count(*) from public.reservations where game_id=gid and id<>r.id and status in ('confirmed','checked_in'))>=g.capacity then return jsonb_build_object('result','full'); end if;
 end if;
 next_status:=case when p_action='confirm' then 'confirmed' when p_action='cancel' then 'cancelled' else r.status end;
 update public.reservations set status=next_status,contact_required=(p_action='contact'),reviewed_by=null,reviewed_at=now() where id=r.id;
 insert into public.reservation_audit(reservation_id,previous_status,new_status,telegram_actor_id,telegram_actor_name,telegram_action)
 values(r.id,r.status,next_status,p_actor,left(p_actor_name,100),p_action);
 return jsonb_build_object('result',case when p_action='confirm' then 'confirmed' when p_action='cancel' then 'cancelled' else 'contact' end);
end $$;
revoke all on function public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) to service_role;
