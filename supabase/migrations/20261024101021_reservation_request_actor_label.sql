-- Preserve staff identity when the existing display name is empty.
create or replace function public.submit_reservation_request(p_command uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c reservation_private.commands%rowtype; d jsonb; r reservations%rowtype;
 principal text:=coalesce(auth.uid()::text,'guest'); isstaff boolean:=current_app_role() in ('admin','staff','desk','cashier'); test boolean; src text; result jsonb;
begin
 if p_command is null then raise exception 'Request ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_command::text,0));
 select * into c from reservation_private.commands where id=p_command;
 if found then
  if c.principal<>principal or c.request<>p_data then raise exception 'Request ID already used'; end if;
  return c.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation-capacity',0));
 select is_test into test from reservation_games where id=(p_data->>'game_id')::uuid;
 if test and not isstaff then raise exception 'Staff login required'; end if;
 src:=case when p_data->>'source'='desk' and isstaff then 'desk' else 'guest' end;
 d:=reservation_private.checked_details(p_data,coalesce(test,false));
 if exists(select 1 from reservations where game_id=(d->>'game_id')::uuid and (lower(regexp_replace(btrim(player_name),'\s+',' ','g'))=lower(d->>'player_name') or (src='guest' and auth.uid() is not null and member_user_id=auth.uid())) and status in ('pending','confirmed','waitlisted','checked_in')) then raise exception 'An active reservation already exists for this player'; end if;
 insert into reservations(game_id,player_name,player_name_en,player_name_ko,arrival_at,party_size,guest_note,source,requested_by,member_user_id,is_test,updated_actor)
 values((d->>'game_id')::uuid,d->>'player_name',d->>'player_name_en',d->>'player_name_ko',(d->>'arrival_at')::timestamptz,(d->>'party_size')::integer,d->>'guest_note',src,auth.uid(),case when src='guest' then auth.uid() end,test,
 case when src='desk' then coalesce((select coalesce(nullif(btrim(display_name),''),nullif(btrim(username),''),role) from user_profiles where user_id=auth.uid()),'Desk') else 'Guest' end) returning * into r;
 insert into reservation_audit(reservation_id,new_status,actor,action,details,actor_name) values(r.id,r.status,auth.uid(),'request',d,r.updated_actor);
 result:=jsonb_build_object('reservation_id',r.id,'reservation_token',r.lookup_token,'version',r.version);
 insert into reservation_private.commands(id,principal,request,response) values(p_command,principal,p_data,result);
 return result;
end $$;

