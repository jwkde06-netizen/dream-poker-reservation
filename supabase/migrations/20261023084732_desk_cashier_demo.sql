-- Isolated demonstration state. No FK, trigger, or writes to operational reservations.
create table reservation_private.demo_rooms (
 id uuid primary key,
 desk_hash text not null check(length(desk_hash)=64),
 cashier_hash text not null check(length(cashier_hash)=64),
 state jsonb not null,
 revision integer not null default 0,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '72 hours'
);
create table reservation_private.demo_commands (
 room_id uuid not null references reservation_private.demo_rooms(id),
 request_id uuid not null,
 actor text not null check(actor in ('desk','cashier')),
 fingerprint text not null,
 revision integer not null,
 primary key(room_id,request_id)
);
alter table reservation_private.demo_rooms enable row level security;
alter table reservation_private.demo_commands enable row level security;
revoke all on reservation_private.demo_rooms,reservation_private.demo_commands from public,anon,authenticated;

create function public.create_reservation_demo(p_room uuid,p_desk_hash text,p_cashier_hash text,p_state jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservation_private.demo_rooms%rowtype;
begin
 perform pg_advisory_xact_lock(hashtext('reservation-demo-create'));
 select * into r from reservation_private.demo_rooms where id=p_room;
 if found then
  if r.desk_hash<>p_desk_hash or r.cashier_hash<>p_cashier_hash or r.expires_at<=now() then raise exception 'Invalid demo session'; end if;
  return jsonb_build_object('expires_at',r.expires_at);
 end if;
 if length(p_desk_hash)<>64 or length(p_cashier_hash)<>64 or p_desk_hash=p_cashier_hash then raise exception 'Invalid demo keys'; end if;
 if (select count(*) from reservation_private.demo_rooms where created_at>now()-interval '1 hour')>=20 then raise exception 'Demo creation limit reached'; end if;
 insert into reservation_private.demo_rooms(id,desk_hash,cashier_hash,state) values(p_room,p_desk_hash,p_cashier_hash,p_state) returning * into r;
 return jsonb_build_object('expires_at',r.expires_at);
end $$;

create function public.load_reservation_demo(p_room uuid,p_key_hash text,p_request uuid default null,p_fingerprint text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservation_private.demo_rooms%rowtype; c reservation_private.demo_commands%rowtype; actor text;
begin
 select * into r from reservation_private.demo_rooms where id=p_room and expires_at>now();
 if not found then return null; end if;
 actor:=case when p_key_hash=r.desk_hash then 'desk' when p_key_hash=r.cashier_hash then 'cashier' end;
 if actor is null then return null; end if;
 if p_request is not null then
  select * into c from reservation_private.demo_commands where room_id=p_room and request_id=p_request;
  if found and (c.actor<>actor or c.fingerprint<>p_fingerprint) then raise exception 'Idempotency key mismatch'; end if;
 end if;
 return jsonb_build_object('role',actor,'state',r.state,'revision',r.revision,'expires_at',r.expires_at,'replayed',c.request_id is not null);
end $$;

create function public.commit_reservation_demo(p_room uuid,p_key_hash text,p_request uuid,p_fingerprint text,p_expected_revision integer,p_state jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r reservation_private.demo_rooms%rowtype; c reservation_private.demo_commands%rowtype; actor text;
begin
 select * into r from reservation_private.demo_rooms where id=p_room and expires_at>now() for update;
 if not found then return null; end if;
 actor:=case when p_key_hash=r.desk_hash then 'desk' when p_key_hash=r.cashier_hash then 'cashier' end;
 if actor is null then return null; end if;
 select * into c from reservation_private.demo_commands where room_id=p_room and request_id=p_request;
 if found then
  if c.actor<>actor or c.fingerprint<>p_fingerprint then raise exception 'Idempotency key mismatch'; end if;
  return jsonb_build_object('role',actor,'state',r.state,'revision',r.revision,'expires_at',r.expires_at,'replayed',true);
 end if;
 if r.revision<>p_expected_revision then return jsonb_build_object('conflict',true); end if;
 if p_request is null or p_fingerprint is null or p_state is null or length(p_state::text)>1000000 then raise exception 'Invalid demo command'; end if;
 update reservation_private.demo_rooms set state=p_state,revision=revision+1 where id=p_room returning * into r;
 insert into reservation_private.demo_commands(room_id,request_id,actor,fingerprint,revision) values(p_room,p_request,actor,p_fingerprint,r.revision);
 return jsonb_build_object('role',actor,'state',r.state,'revision',r.revision,'expires_at',r.expires_at,'replayed',false);
end $$;
revoke all on function public.create_reservation_demo(uuid,text,text,jsonb),public.load_reservation_demo(uuid,text,uuid,text),public.commit_reservation_demo(uuid,text,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_reservation_demo(uuid,text,text,jsonb),public.load_reservation_demo(uuid,text,uuid,text),public.commit_reservation_demo(uuid,text,uuid,text,integer,jsonb) to service_role;
