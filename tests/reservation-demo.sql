begin;
do $$
declare room uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); doc jsonb:='{"games":[],"bookings":[],"events":[]}'; result jsonb; live_count bigint; outbox_count bigint;
begin
 select count(*) into live_count from public.reservations;
 select count(*) into outbox_count from reservation_private.outbox;
 assert not has_function_privilege('anon','public.create_reservation_demo(uuid,text,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.commit_reservation_demo(uuid,text,uuid,text,integer,jsonb)','execute');
 assert not has_table_privilege('anon','reservation_private.demo_rooms','select');
 assert not has_table_privilege('authenticated','reservation_private.demo_commands','insert');
 assert (select relrowsecurity from pg_class where oid='reservation_private.demo_rooms'::regclass);
 perform public.create_reservation_demo(room,repeat('a',64),repeat('b',64),doc);
 perform public.create_reservation_demo(room,repeat('a',64),repeat('b',64),doc);
 assert (select count(*)=1 from reservation_private.demo_rooms where id=room),'create retry idempotent';
 assert public.load_reservation_demo(room,repeat('c',64)) is null,'wrong capability blocked';
 assert public.load_reservation_demo(room,repeat('a',64))->>'role'='desk';
 assert public.load_reservation_demo(room,repeat('b',64))->>'role'='cashier';
 result:=public.commit_reservation_demo(room,repeat('a',64),req,'fingerprint',0,doc);
 assert (result->>'revision')::integer=1;
 result:=public.commit_reservation_demo(room,repeat('a',64),req,'fingerprint',0,doc);
 assert (result->>'replayed')::boolean and (result->>'revision')::integer=1,'acknowledgement loss retry is idempotent';
 assert (select count(*)=1 from reservation_private.demo_commands where room_id=room);
 result:=public.commit_reservation_demo(room,repeat('b',64),gen_random_uuid(),'other',0,doc);
 assert (result->>'conflict')::boolean,'stale room cannot overwrite another action';
 begin
  perform public.load_reservation_demo(room,repeat('a',64),req,'different');
  raise exception 'FAIL: reused ID accepted different input';
 exception when raise_exception then if SQLERRM not like '%Idempotency key mismatch%' then raise; end if; end;
 begin
  perform public.load_reservation_demo(room,repeat('b',64),req,'fingerprint');
  raise exception 'FAIL: cashier replayed desk identity';
 exception when raise_exception then if SQLERRM not like '%Idempotency key mismatch%' then raise; end if; end;
 update reservation_private.demo_rooms set expires_at=now()-interval '1 second' where id=room;
 assert public.load_reservation_demo(room,repeat('a',64)) is null;
 assert public.commit_reservation_demo(room,repeat('a',64),req,'fingerprint',1,doc) is null;
 assert (select count(*) from public.reservations)=live_count,'no operational reservations';
 assert (select count(*) from reservation_private.outbox)=outbox_count,'no Telegram jobs';
end $$;
rollback;
