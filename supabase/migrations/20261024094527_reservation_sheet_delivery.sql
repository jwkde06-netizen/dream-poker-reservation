-- Stage 3: isolated test delivery guard, disabled sheet worker and realtime.
-- A single leased snapshot is written only to the separate reservation sheet.
-- No booking event writes to the receipt ledger or creates a buy-in.
create table reservation_private.sheet_sync (
 id boolean primary key default true check(id), enabled boolean not null default false,
 revision bigint not null default 1, synced_revision bigint not null default 0,
 dispatch_token uuid not null default gen_random_uuid(), dispatched_at timestamptz,
 lease_id uuid, lease_until timestamptz, last_synced_at timestamptz, last_error text
);
insert into reservation_private.sheet_sync(id) values(true);
revoke all on reservation_private.sheet_sync from public,anon,authenticated;
alter table reservation_private.sheet_sync enable row level security;

create function reservation_private.dispatch_sheet() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s reservation_private.sheet_sync%rowtype;
begin
 select * into s from reservation_private.sheet_sync where id for update skip locked;
 if not found or not s.enabled or s.lease_until>now() or s.dispatched_at>now()-interval '45 seconds' then return; end if;
 if s.revision=s.synced_revision and s.last_synced_at>now()-interval '5 minutes' then return; end if;
 update reservation_private.sheet_sync set dispatch_token=gen_random_uuid(),dispatched_at=now() where id returning * into s;
 perform net.http_post(url:='https://dream-poker-reservation.vercel.app/api/reservation-sheet/deliver',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('token',s.dispatch_token),timeout_milliseconds:=1000);
end $$;

create or replace function reservation_private.enqueue_booking() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare g reservation_games%rowtype;
begin
 if tg_op='UPDATE' then if new.version=old.version then return new; end if; end if;
 select * into g from reservation_games where id=new.game_id;
 if new.is_test or g.is_test then return new; end if;
 insert into reservation_private.outbox(reservation_id,version,payload) values(new.id,new.version,
 jsonb_build_object('reservation_id',new.id,'version',new.version,'event',case when tg_op='INSERT' then 'requested' else 'updated' end,
 'status',new.status,'contact_required',new.contact_required,'player_name',new.player_name,'player_name_en',new.player_name_en,'player_name_ko',new.player_name_ko,
 'arrival_at',new.arrival_at,'party_size',new.party_size,'request_kind',new.request_kind,'proposed',new.proposed,'proposed_game',case when new.request_kind='change' then (select title||case when is_default_queue then '' else ' · Table '||table_no||' / No.'||game_no end from reservation_games where id=(new.proposed->>'game_id')::uuid) end,'staff_reply',new.staff_reply,'alternative_at',new.alternative_at,
 'guest_note',new.guest_note,'game_title',g.title,'table_no',g.table_no,'game_no',g.game_no));
 update reservation_private.sheet_sync set revision=revision+1 where id;
 begin perform reservation_private.dispatch(); exception when others then null; end;
 begin perform reservation_private.dispatch_sheet(); exception when others then null; end;
 return new;
end $$;

create function public.claim_reservation_sheet(p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s reservation_private.sheet_sync%rowtype; rows jsonb;
begin
 select * into s from reservation_private.sheet_sync where dispatch_token=p_token and enabled for update;
 if not found or s.lease_until>now() then return null; end if;
 update reservation_private.sheet_sync set lease_id=gen_random_uuid(),lease_until=now()+interval '120 seconds' where id returning * into s;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]') into rows from (
 select r.id,r.created_at,r.player_name,r.party_size,r.arrival_at,r.status,r.request_kind,r.source,r.guest_note,r.staff_reply,r.alternative_at,r.updated_actor,r.updated_at,
 g.title as game_title,g.game_no,g.table_no,g.starts_at,g.is_default_queue from reservations r join reservation_games g on g.id=r.game_id where not r.is_test and not g.is_test
 ) x;
 return jsonb_build_object('lease_id',s.lease_id,'revision',s.revision,'rows',rows);
end $$;
create function public.finish_reservation_sheet(p_lease uuid,p_revision bigint,p_error text default null) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update reservation_private.sheet_sync set synced_revision=case when p_error is null then p_revision else synced_revision end,
 last_synced_at=case when p_error is null then now() else last_synced_at end,last_error=left(p_error,500),lease_id=null,lease_until=null
 where lease_id=p_lease and lease_until>now();
 return found;
end $$;
create function public.reservation_sheet_status() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if current_app_role() not in ('admin','staff','desk','cashier') then raise exception 'Staff login required'; end if;
 return (select jsonb_build_object('enabled',enabled,'pending',revision>synced_revision,'last_synced_at',last_synced_at,'error',last_error,'receipt_based',true) from reservation_private.sheet_sync where id);
end $$;
revoke all on function reservation_private.dispatch_sheet(),public.claim_reservation_sheet(uuid),public.finish_reservation_sheet(uuid,bigint,text),public.reservation_sheet_status() from public,anon,authenticated;
grant execute on function public.claim_reservation_sheet(uuid),public.finish_reservation_sheet(uuid,bigint,text) to service_role;
grant execute on function public.reservation_sheet_status() to authenticated;
select cron.schedule('dream-reservation-sheet','* * * * *','select reservation_private.dispatch_sheet()');

do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reservations') then
  alter publication supabase_realtime add table public.reservations;
 end if;
end $$;
