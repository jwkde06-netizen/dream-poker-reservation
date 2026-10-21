-- A permanent intake queue is not a scheduled game or a guaranteed seat.
alter table public.reservation_games add column if not exists is_default_queue boolean not null default false;
create unique index if not exists reservation_single_default_queue on public.reservation_games(is_default_queue) where is_default_queue;

-- Preserve each existing guest/member overload and its identity/duplicate checks.
do $migration$
declare f record; source text; updated text;
begin
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('request_poker_reservation','request_member_poker_reservation') loop
 source:=pg_get_functiondef(f.oid);
 updated:=replace(source,$old$g.starts_at<now()-interval '12 hours'$old$,$new$(not g.is_default_queue and g.starts_at<now()-interval '12 hours')$new$);
 updated:=replace(updated,$old$p_arrival>g.starts_at+interval '18 hours'$old$,$new$p_arrival>(case when g.is_default_queue then now()+interval '24 hours' else g.starts_at+interval '18 hours' end)$new$);
 if updated=source then raise exception 'Reservation function changed; inspect before applying'; end if;
 execute updated;
 end loop;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='manage_reservation_game';
 updated:=replace(source,$old$('admin','staff')$old$,$new$('admin','staff','cashier')$new$);
 updated:=replace(updated,$old$t:=btrim(coalesce(p_table_no,''));$old$,$new$if exists(select 1 from public.reservation_games where id=p_id and is_default_queue) then raise exception 'The next 5M intake queue is always open. Create a scheduled game to assign bookings.'; end if;
 t:=btrim(coalesce(p_table_no,''));$new$);
 execute updated;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='review_poker_reservation';
 updated:=replace(source,$old$if r.status=p_status then return true; end if;$old$,$new$if r.status=p_status then return true; end if;
 if g.is_default_queue and p_status in ('confirmed','checked_in') then raise exception '시작 시간과 테이블이 정해진 게임에 배정한 뒤 확정해주세요. Assign a scheduled game before confirming.'; end if;$new$);
 execute updated;
 select pg_get_functiondef(oid) into source from pg_proc where pronamespace='public'::regnamespace and proname='assign_poker_reservation';
 updated:=replace(source,$old$if g.id is null then raise exception 'Target game is closed'; end if;$old$,$new$if g.id is null then raise exception 'Target game is closed'; end if;
 if g.is_default_queue then raise exception 'Assign a scheduled game, not the intake queue'; end if;$new$);
 execute updated;
end $migration$;

create or replace function public.reservation_public_stats()
returns table(game_id uuid,confirmed_count bigint,pending_count bigint,waiting_count bigint)
language sql stable security definer set search_path=public,pg_temp as $$
 select g.id,
 (select count(*) from public.reservations r where r.game_id=g.id and r.status in ('confirmed','checked_in')),
 (select count(*) from public.reservations r where r.game_id=g.id and r.status='pending'),
 (select count(*) from public.reservations r where r.game_id=g.id and r.status='waitlisted')
 from public.reservation_games g where g.is_open and (g.is_default_queue or g.starts_at>now()-interval '12 hours');
$$;
