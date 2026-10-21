begin;
do $$
declare uid uuid; g uuid; scheduled uuid; rid uuid; blocked boolean;
begin
 select user_id into uid from public.user_profiles where role='admin' and active limit 1;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select id into g from public.reservation_games where is_default_queue;
 if g is null then
 insert into public.reservation_games(title,starts_at,capacity,is_open,is_default_queue) values('다음 5M 게임','2000-01-01',9,true,true) returning id into g;
 else update public.reservation_games set starts_at='2000-01-01' where id=g; end if;
 select reservation_id into rid from public.request_poker_reservation(g,'ROLLBACK NEXT 5M TEST',now()+interval '1 hour','rollback only');
 assert rid is not null,'evergreen queue accepts requests after its creation date';
 assert exists(select 1 from public.reservation_public_stats() where game_id=g),'evergreen stats remain visible';
 blocked:=false;begin perform public.request_poker_reservation(g,'ROLLBACK LATE ARRIVAL',now()+interval '25 hours','');exception when others then blocked:=true;end;assert blocked,'arrival must be within 24 hours';
 blocked:=false;begin perform public.review_poker_reservation(rid,'confirmed',0);exception when others then blocked:=true;end;assert blocked,'placeholder is not a confirmed seat';
 update public.user_profiles set role='cashier' where user_id=uid;
 scheduled:=public.manage_reservation_game(null,'5M TIME ATTACK','test-5m','test',now()+interval '1 hour',9,true);
 assert scheduled is not null,'cashier can open scheduled game';
 assert public.assign_poker_reservation(rid,scheduled,0),'advance request can be assigned';
 assert public.review_poker_reservation(rid,'confirmed',1),'cashier can confirm after assignment';
 blocked:=false;begin perform public.manage_reservation_game(g,'changed','test','changed',now(),9,false);exception when others then blocked:=true;end;assert blocked,'evergreen cannot accidentally close';
 update public.user_profiles set role='desk' where user_id=uid;
 blocked:=false;begin perform public.manage_reservation_game(null,'5M','testdesk','1',now(),9,true);exception when others then blocked:=true;end;assert blocked,'desk review access does not grant schedule management';
 assert public.review_poker_reservation(rid,'checked_in',2),'desk still reviews assigned reservations';
end $$;
rollback;
