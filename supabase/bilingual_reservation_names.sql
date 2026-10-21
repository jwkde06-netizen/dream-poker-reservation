alter table public.reservations add column if not exists player_name_en text;
alter table public.reservations add column if not exists player_name_ko text;
alter table public.reservations add constraint reservation_name_en_length check (player_name_en is null or length(player_name_en) between 2 and 80);
alter table public.reservations add constraint reservation_name_ko_length check (player_name_ko is null or length(player_name_ko) between 2 and 80);

create or replace function public.request_named_poker_reservation(p_game uuid,p_name_en text,p_name_ko text,p_arrival timestamptz,p_note text default '')
returns table(reservation_id uuid,reservation_token uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.reservation_games%rowtype; en text:=nullif(btrim(p_name_en),''); ko text:=nullif(btrim(p_name_ko),''); r public.reservations%rowtype;
begin
 if en is null and ko is null then raise exception '영문명 또는 한글명을 입력해주세요.'; end if;
 if (en is not null and length(en) not between 2 and 80) or (ko is not null and length(ko) not between 2 and 80) then raise exception '이름은 2~80자로 입력해주세요.'; end if;
 select * into g from public.reservation_games where id=p_game and is_open for update;
 if not found or (not g.is_default_queue and g.starts_at<now()-interval '12 hours') then raise exception '예약 접수가 종료된 게임입니다.'; end if;
 if p_arrival is null or p_arrival<now()-interval '2 hours' or p_arrival>(case when g.is_default_queue then now()+interval '24 hours' else g.starts_at+interval '18 hours' end) then raise exception '도착 시간이 올바르지 않습니다.'; end if;
 if exists(select 1 from public.reservations x where x.game_id=p_game and x.status in ('pending','confirmed','waitlisted','checked_in') and ((en is not null and (lower(x.player_name_en)=lower(en) or lower(x.player_name)=lower(en))) or (ko is not null and (lower(x.player_name_ko)=lower(ko) or lower(x.player_name)=lower(ko))))) then raise exception '해당 게임에 같은 이름의 예약이 이미 있습니다.'; end if;
 insert into public.reservations(game_id,player_name,player_name_en,player_name_ko,arrival_at,guest_note) values(p_game,coalesce(en,ko),en,ko,p_arrival,left(btrim(coalesce(p_note,'')),500)) returning * into r;
 insert into public.reservation_audit(reservation_id,new_status) values(r.id,'pending');
 return query select r.id,r.lookup_token;
end $$;
revoke all on function public.request_named_poker_reservation(uuid,text,text,timestamptz,text) from public;
grant execute on function public.request_named_poker_reservation(uuid,text,text,timestamptz,text) to anon,authenticated;

do $patch$ declare source text; begin
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='reservation_private'::regnamespace and proname='enqueue_booking';
 execute replace(source,$old$'player_name',new.player_name,$old$,$new$'player_name',new.player_name,'player_name_en',new.player_name_en,'player_name_ko',new.player_name_ko,$new$);
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='reservation_private'::regnamespace and proname='booking_version';
 source:=replace(source,'new.guest_note,new.player_name)','new.guest_note,new.player_name,new.player_name_en,new.player_name_ko)');
 source:=replace(source,'old.guest_note,old.player_name)','old.guest_note,old.player_name,old.player_name_en,old.player_name_ko)');
 execute source;
end $patch$;

create or replace function public.lookup_named_poker_reservation(p_token uuid)
returns table(reservation_id uuid,game_id uuid,game_title text,player_name text,arrival_at timestamptz,status text,created_at timestamptz,player_name_en text,player_name_ko text)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.id,r.game_id,g.title,r.player_name,r.arrival_at,r.status,r.created_at,r.player_name_en,r.player_name_ko
 from public.reservations r join public.reservation_games g on g.id=r.game_id where r.lookup_token=p_token;
$$;
revoke all on function public.lookup_named_poker_reservation(uuid) from public;
grant execute on function public.lookup_named_poker_reservation(uuid) to anon,authenticated;
