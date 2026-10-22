begin;
select set_config('test.player_a',gen_random_uuid()::text,true),set_config('test.player_b',gen_random_uuid()::text,true),set_config('test.game',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('test.player_a')::uuid,'player-a-'||current_setting('test.player_a')||'@example.invalid','{"role":"admin","display_name":"TEST ONLY"}'),
 (current_setting('test.player_b')::uuid,'player-b-'||current_setting('test.player_b')||'@example.invalid','{}');
insert into public.reservation_games(id,title,starts_at,capacity,is_open,table_no) values(current_setting('test.game')::uuid,'TEST ONLY ROLLBACK',now()+interval '1 hour',9,true,'TEST');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.player_a'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('test.player_a'),'role','authenticated')::text,true);
select * from public.request_named_poker_reservation(current_setting('test.game')::uuid,'TEST PLAYER A',null,now()+interval '30 minutes','ROLLBACK TEST');
do $$ begin
 if (select count(*) from public.reservations where game_id=current_setting('test.game')::uuid and member_user_id=auth.uid())<>1 then raise exception 'Owner attachment or own-read failed'; end if;
 if public.current_app_role() in ('admin','staff','cashier','desk') then raise exception 'Metadata elevated player'; end if;
 begin
  insert into public.reservations(game_id,player_name,arrival_at,member_user_id) values(current_setting('test.game')::uuid,'FORGED INSERT',now(),auth.uid());
  raise exception 'Direct insert was allowed';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.player_b'),true),set_config('request.jwt.claims',json_build_object('sub',current_setting('test.player_b'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.reservations where game_id=current_setting('test.game')::uuid) then raise exception 'Other account exposed'; end if;
end $$;
select * from public.request_named_poker_reservation(current_setting('test.game')::uuid,'TEST PLAYER B',null,now()+interval '30 minutes','ROLLBACK TEST');
do $$ begin
 if (select count(*) from public.reservations where game_id=current_setting('test.game')::uuid)<>1 then raise exception 'Account listing isolation failed'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 if exists(select 1 from public.reservations where game_id=current_setting('test.game')::uuid) then raise exception 'Anonymous listing exposed players'; end if;
end $$;
select * from public.request_named_poker_reservation(current_setting('test.game')::uuid,'TEST GUEST',null,now()+interval '30 minutes','ROLLBACK TEST');
reset role;
do $$ begin
 if (select count(*) from public.reservations where game_id=current_setting('test.game')::uuid and member_user_id is null)<>1 then raise exception 'Guest compatibility failed'; end if;
 if (select count(*) from public.reservations where game_id=current_setting('test.game')::uuid)<>3 then raise exception 'Unexpected reservations'; end if;
end $$;
rollback;
select 'PASS: owned bookings, cross-account isolation, anonymous isolation, rejected direct writes, safe roles, guest compatibility; no data committed' as result;
