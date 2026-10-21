begin;
do $$
declare g uuid; a uuid; tok uuid; blocked boolean;
begin
 insert into public.reservation_games(title,starts_at,capacity,is_open,table_no) values('BILINGUAL ROLLBACK TEST',now()+interval '1 hour',9,true,'test') returning id into g;
 select reservation_id,reservation_token into a,tok from public.request_named_poker_reservation(g,'TEST KIM JI WON','테스트 김지원',now()+interval '30 minutes','');
 assert (select player_name_en='TEST KIM JI WON' and player_name_ko='테스트 김지원' and status='pending' from public.reservations where id=a),'separate names and pending status';
 assert (select payload->>'player_name_en'='TEST KIM JI WON' and payload->>'player_name_ko'='테스트 김지원' from reservation_private.outbox where reservation_id=a),'both names present before notification delivery';
 assert (select player_name_ko='테스트 김지원' from public.lookup_named_poker_reservation(tok)),'guest lookup preserves both names';
 assert not exists(select 1 from public.lookup_named_poker_reservation(gen_random_uuid())),'unknown token reveals nothing';
 blocked:=false;begin perform public.request_named_poker_reservation(g,'test kim ji won','다른 한글명',now()+interval '30 minutes','');exception when others then blocked:=true;end;assert blocked,'duplicate English name blocked';
 blocked:=false;begin perform public.request_named_poker_reservation(g,'DIFFERENT NAME','테스트 김지원',now()+interval '30 minutes','');exception when others then blocked:=true;end;assert blocked,'duplicate Korean name blocked';
 perform public.request_named_poker_reservation(g,'ENGLISH ONLY','',now()+interval '30 minutes','');
 perform public.request_named_poker_reservation(g,'','한글만',now()+interval '30 minutes','');
 blocked:=false;begin perform public.request_named_poker_reservation(g,'','',now()+interval '30 minutes','');exception when others then blocked:=true;end;assert blocked,'empty names blocked';
 assert has_function_privilege('anon','public.request_named_poker_reservation(uuid,text,text,timestamptz,text)','execute'),'guests can request without login';
end $$;
rollback;
