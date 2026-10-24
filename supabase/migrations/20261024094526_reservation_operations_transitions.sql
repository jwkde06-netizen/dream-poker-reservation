-- Stage 2: canonical reservation commands and compatibility wrappers.
create function reservation_private.booking_context() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare test boolean;
begin
 select is_test into test from reservation_games where id=new.game_id;
 if test and current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff login required'; end if;
 new.is_test:=coalesce(test,false);
 return new;
end $$;
revoke all on function reservation_private.booking_context() from public,anon,authenticated;
create trigger reservation_context before insert on public.reservations for each row execute function reservation_private.booking_context();

create function reservation_private.guard_game_capacity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.capacity<(select coalesce(sum(party_size),0) from reservations where game_id=new.id and status in ('confirmed','checked_in')) then
  raise exception 'Capacity cannot be lower than confirmed guests';
 end if;
 return new;
end $$;
revoke all on function reservation_private.guard_game_capacity() from public,anon,authenticated;
create trigger reservation_capacity before update of capacity on public.reservation_games for each row execute function reservation_private.guard_game_capacity();

create or replace function reservation_private.booking_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status is distinct from old.status then new.contact_required:=false; end if;
 if (to_jsonb(new)-array['version','updated_at','telegram_notification_claimed_at','telegram_notified_at'])
    is distinct from (to_jsonb(old)-array['version','updated_at','telegram_notification_claimed_at','telegram_notified_at']) then
  new.version:=old.version+1; new.updated_at:=now();
 else new.version:=old.version; new.updated_at:=old.updated_at; end if;
 return new;
end $$;

create function reservation_private.checked_details(p jsonb,p_test boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g reservation_games%rowtype; n text; k text; a timestamptz; seats integer;
begin
 select * into g from reservation_games where id=(p->>'game_id')::uuid for update;
 if not found or not g.is_open or g.is_test<>p_test then raise exception 'Game is not available'; end if;
 if not g.is_default_queue and g.starts_at<now()-interval '12 hours' then raise exception 'Game has ended'; end if;
 n:=regexp_replace(btrim(coalesce(p->>'player_name_en',p->>'player_name','')),'\s+',' ','g'); k:=btrim(coalesce(p->>'player_name_ko',''));
 if length(n) not between 2 and 80 or n!~'^[A-Za-z][A-Za-z .''-]+$' then raise exception 'Enter an English name (2-80 letters)'; end if;
 if length(k)>80 or length(k)=1 then raise exception 'Invalid Korean name'; end if;
 a:=(p->>'arrival_at')::timestamptz; seats:=coalesce((p->>'party_size')::integer,1);
 if a is null or a<now()-interval '2 hours' or a>greatest(now(),g.starts_at)+interval '7 days' then raise exception 'Check arrival time'; end if;
 if seats not between 1 and 30 then raise exception 'Party size must be 1-30'; end if;
 if length(coalesce(p->>'guest_note',''))>500 then raise exception 'Note is too long'; end if;
 return jsonb_build_object('game_id',g.id,'player_name',n,'player_name_en',n,'player_name_ko',nullif(k,''),'arrival_at',a,'party_size',seats,'guest_note',btrim(coalesce(p->>'guest_note','')));
end $$;

create function public.submit_reservation_request(p_command uuid,p_data jsonb) returns jsonb
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
 case when src='desk' then coalesce((select display_name from user_profiles where user_id=auth.uid()),'Desk') else 'Guest' end) returning * into r;
 insert into reservation_audit(reservation_id,new_status,actor,action,details,actor_name) values(r.id,r.status,auth.uid(),'request',d,r.updated_actor);
 result:=jsonb_build_object('reservation_id',r.id,'reservation_token',r.lookup_token,'version',r.version);
 insert into reservation_private.commands(id,principal,request,response) values(p_command,principal,p_data,result);
 return result;
end $$;

-- All web and Telegram transitions enter the same transaction and capacity lock.
create function reservation_private.apply_operation(p_id uuid,p_version integer,p_action text,p_data jsonb,p_actor uuid,p_actor_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; before_row jsonb; d jsonb; g reservation_games%rowtype; used integer; reply text:=btrim(coalesce(p_data->>'reply','')); next_status text;
begin
 perform pg_advisory_xact_lock(hashtextextended('reservation-capacity',0));
 select * into r from reservations where id=p_id for update;
 if not found then raise exception 'Reservation not found'; end if;
 if p_version is null or p_version<>r.version then raise exception 'Reservation changed. Reload and try again'; end if;
 if r.status not in ('pending','waitlisted','confirmed') then raise exception 'Reservation is no longer active'; end if;
 if length(reply)>500 then raise exception 'Reply is too long'; end if;
 before_row:=to_jsonb(r); next_status:=r.status;
 if p_action='request_change' then
  d:=reservation_private.checked_details(to_jsonb(r)||p_data,r.is_test);
  r.proposed:=d; r.request_kind:='change'; r.staff_reply:=''; r.alternative_at:=null;
 elsif p_action='request_cancel' then
  r.request_kind:='cancel'; r.proposed:=jsonb_build_object('reason',left(coalesce(p_data->>'reason',''),500)); r.staff_reply:=''; r.alternative_at:=null;
 elsif p_action='approve' then
  if r.request_kind='cancel' then next_status:='cancelled';
  else
   if r.request_kind='change' then
    d:=reservation_private.checked_details(r.proposed,r.is_test);
    r.game_id:=(d->>'game_id')::uuid; r.player_name:=d->>'player_name'; r.player_name_en:=d->>'player_name_en'; r.player_name_ko:=d->>'player_name_ko';
    r.arrival_at:=(d->>'arrival_at')::timestamptz; r.party_size:=(d->>'party_size')::integer; r.guest_note:=d->>'guest_note';
   end if;
   select * into g from reservation_games where id=r.game_id for update;
   if not g.is_open then raise exception 'Game is closed'; end if;
   select coalesce(sum(party_size),0) into used from reservations where game_id=r.game_id and id<>r.id and status in ('confirmed','checked_in');
   if used+r.party_size>g.capacity then raise exception 'Not enough seats available'; end if;
   if exists(select 1 from reservations where game_id=r.game_id and id<>r.id and (lower(regexp_replace(btrim(player_name),'\s+',' ','g'))=lower(r.player_name) or (r.member_user_id is not null and member_user_id=r.member_user_id)) and status in ('pending','confirmed','waitlisted','checked_in')) then raise exception 'An active reservation already exists for this player'; end if;
   next_status:='confirmed';
  end if;
  r.request_kind:='none'; r.proposed:='{}'; r.staff_reply:=reply; r.alternative_at:=null; r.contact_required:=false;
 elsif p_action in ('reject','suggest') then
  if reply='' then raise exception 'Reason or alternative is required'; end if;
  if r.request_kind not in ('change','cancel') then
   if r.status='confirmed' then raise exception 'Use cancellation for a confirmed reservation'; end if;
   next_status:=case when p_action='reject' then 'rejected' else 'waitlisted' end;
  end if;
  r.request_kind:='none'; r.proposed:='{}'; r.staff_reply:=reply; r.alternative_at:=nullif(p_data->>'alternative_at','')::timestamptz; r.contact_required:=false;
 elsif p_action='cancel' then next_status:='cancelled'; r.request_kind:='none'; r.proposed:='{}'; r.staff_reply:=reply; r.contact_required:=false;
 elsif p_action in ('check_in','no_show') then
  if r.status<>'confirmed' or r.request_kind<>'none' then raise exception 'Confirm or resolve the request first'; end if;
  next_status:=case when p_action='check_in' then 'checked_in' else 'no_show' end;
 elsif p_action='contact' then r.contact_required:=true; r.staff_reply:=coalesce(nullif(reply,''),'Please contact the Korean desk on KakaoTalk.');
 else raise exception 'Invalid reservation action'; end if;
 update reservations set game_id=r.game_id,player_name=r.player_name,player_name_en=r.player_name_en,player_name_ko=r.player_name_ko,arrival_at=r.arrival_at,party_size=r.party_size,
  guest_note=r.guest_note,status=next_status,request_kind=r.request_kind,proposed=r.proposed,staff_reply=r.staff_reply,alternative_at=r.alternative_at,contact_required=r.contact_required,
  reviewed_by=case when p_action like 'request_%' then reviewed_by else p_actor end,reviewed_at=case when p_action like 'request_%' then reviewed_at else now() end,updated_actor=p_actor_name
 where id=r.id returning * into r;
 insert into reservation_audit(reservation_id,previous_status,new_status,actor,action,details,actor_name)
 values(r.id,before_row->>'status',r.status,p_actor,p_action,jsonb_build_object('before',before_row-array['lookup_token'],'after',to_jsonb(r)-array['lookup_token']),p_actor_name);
 return jsonb_build_object('reservation_id',r.id,'status',r.status,'version',r.version,'request_kind',r.request_kind);
end $$;

create function public.staff_reservation_command(p_command uuid,p_id uuid,p_version integer,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare role text:=current_app_role(); c reservation_private.commands%rowtype; req jsonb; result jsonb; actor_name text;
begin
 if role not in ('admin','staff','desk','cashier') then raise exception 'Staff login required'; end if;
 if role='desk' and p_action not in ('request_change','request_cancel') then raise exception 'Cashier approval required'; end if;
 if p_command is null then raise exception 'Request ID required'; end if;
 req:=jsonb_build_object('id',p_id,'version',p_version,'action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_command::text,0));
 select * into c from reservation_private.commands where id=p_command;
 if found then
  if c.principal<>auth.uid()::text or c.request<>req then raise exception 'Request ID already used'; end if;
  return c.response;
 end if;
 select coalesce(nullif(display_name,''),username,current_app_role()) into actor_name from user_profiles where user_id=auth.uid();
 result:=reservation_private.apply_operation(p_id,p_version,p_action,p_data,auth.uid(),actor_name);
 insert into reservation_private.commands(id,principal,request,response) values(p_command,auth.uid()::text,req,result);
 return result;
end $$;

create function public.reservation_details(p_token uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',r.id,'game_id',r.game_id,'game_title',g.title,'player_name',r.player_name,'player_name_en',r.player_name_en,'player_name_ko',r.player_name_ko,
 'arrival_at',r.arrival_at,'party_size',r.party_size,'status',r.status,'request_kind',r.request_kind,'proposed',r.proposed,'staff_reply',r.staff_reply,'alternative_at',r.alternative_at,
 'contact_required',r.contact_required,'created_at',r.created_at,'updated_at',r.updated_at,'version',r.version)
 from reservations r join reservation_games g on g.id=r.game_id where r.lookup_token=p_token and not r.is_test
$$;

create or replace function public.reservation_public_stats() returns table(game_id uuid,confirmed_count bigint,pending_count bigint,waiting_count bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select g.id,coalesce(sum(r.party_size) filter(where r.status in ('confirmed','checked_in')),0)::bigint,
 coalesce(sum(r.party_size) filter(where r.status='pending'),0)::bigint,coalesce(sum(r.party_size) filter(where r.status='waitlisted'),0)::bigint
 from reservation_games g left join reservations r on r.game_id=g.id where not g.is_test group by g.id
$$;

-- Keep older clients safe during rollout. Desk cannot bypass the approval workflow.
create or replace function public.review_poker_reservation(p_id uuid,p_status text,p_expected_version integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.staff_reservation_command(gen_random_uuid(),p_id,p_expected_version,
 case p_status when 'confirmed' then 'approve' when 'rejected' then 'reject' when 'waitlisted' then 'suggest' when 'checked_in' then 'check_in' when 'no_show' then 'no_show' when 'cancelled' then 'cancel' else 'invalid' end,'{}');
 return true;
end $$;
create or replace function public.assign_poker_reservation(p_id uuid,p_game uuid,p_expected_version integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; v jsonb;
begin
 -- Assignments are proposed first, so a confirmed booking keeps its original seat until approved.
 v:=public.staff_reservation_command(gen_random_uuid(),p_id,p_expected_version,'request_change',jsonb_build_object('game_id',p_game));
 return true;
end $$;

create function public.reservation_test_game() returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid;
begin
 if current_app_role() not in ('admin','staff') then raise exception 'Administrator required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation-test-game',0));
 select id into rid from reservation_games where is_test and is_open limit 1;
 if rid is null then insert into reservation_games(title,starts_at,capacity,is_open,is_default_queue,is_test,description) values('TEST · 5M',now(),9,true,true,true,'Isolated operational verification. No Telegram or accounting writes.') returning id into rid; end if;
 return rid;
end $$;

revoke all on function reservation_private.checked_details(jsonb,boolean),reservation_private.apply_operation(uuid,integer,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.submit_reservation_request(uuid,jsonb),public.staff_reservation_command(uuid,uuid,integer,text,jsonb),public.reservation_details(uuid),public.reservation_test_game() from public,anon,authenticated;
grant execute on function public.submit_reservation_request(uuid,jsonb),public.reservation_details(uuid) to anon,authenticated;
grant execute on function public.staff_reservation_command(uuid,uuid,integer,text,jsonb),public.reservation_test_game() to authenticated;

create or replace function public.apply_reservation_telegram_action(p_delivery uuid,p_chat text,p_message bigint,p_action text,p_actor bigint,p_actor_name text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype; rid uuid; result jsonb;
begin
 if p_action not in ('confirm','contact','cancel') or p_actor is null or p_actor<=0 then raise exception 'Invalid staff action'; end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation-capacity',0));
 select reservation_id into rid from reservation_private.outbox where id=p_delivery;
 select * into r from reservations where id=rid for update;
 if r.id is null or r.is_test or not public.reservation_telegram_action_context(p_delivery,p_chat,p_message) then return jsonb_build_object('result','stale'); end if;
 if r.status not in ('pending','waitlisted','confirmed') then return jsonb_build_object('result','inactive'); end if;
 if (p_action='confirm' and r.status='confirmed' and r.request_kind='none' and not r.contact_required) or (p_action='contact' and r.contact_required) then return jsonb_build_object('result','unchanged'); end if;
 if p_action='cancel' and r.status<>'confirmed' and r.request_kind<>'cancel' then return jsonb_build_object('result','inactive'); end if;
 begin
  result:=reservation_private.apply_operation(r.id,r.version,case p_action when 'confirm' then 'approve' when 'cancel' then 'cancel' else 'contact' end,'{}',null,'Telegram · '||left(p_actor_name,100));
 exception when others then
  if sqlerrm='Not enough seats available' then return jsonb_build_object('result','full'); end if;
  if sqlerrm='Game is closed' then return jsonb_build_object('result','closed'); end if;
  raise;
 end;
 update reservation_audit set telegram_actor_id=p_actor,telegram_actor_name=left(p_actor_name,100),telegram_action=p_action
 where id=(select max(id) from reservation_audit where reservation_id=r.id);
 return jsonb_build_object('result',case when p_action='contact' then 'contact' else result->>'status' end);
end $$;
revoke all on function public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) from public,anon,authenticated;
grant execute on function public.apply_reservation_telegram_action(uuid,text,bigint,text,bigint,text) to service_role;

create or replace function public.cancel_poker_reservation(p_token uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservations%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('reservation-capacity',0));
 select * into r from reservations where lookup_token=p_token for update;
 if r.id is null or r.is_test then return false; end if;
 if r.status='cancelled' then return true; end if;
 perform reservation_private.apply_operation(r.id,r.version,'cancel','{}',auth.uid(),'Guest cancellation');
 return true;
end $$;

