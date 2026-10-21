-- Run after setup inside BEGIN/ROLLBACK. No fixtures or events are retained.
do $$
declare u uuid;g uuid;h uuid;b uuid;tok uuid;n int;failed boolean;
begin
 select user_id into u from public.user_profiles where active and role='admin' limit 1;
 if u is null then raise exception 'Admin test principal missing'; end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.reservation_games(title,starts_at,capacity) values('ROLLBACK ONLY DESK TEST',now()+interval '1 hour',9) returning id into g;
 perform public.desk_action(g,'level4',p_count=>6);
 h:=public.desk_action(g,'hold',p_name=>'LEE DAE JIN',p_code=>'TEST');
 perform public.desk_action(g,'confirm',p_id=>h);
 insert into public.reservations(game_id,player_name,arrival_at) values(g,'ROLLBACK TEST PLAYER',now()) returning id,lookup_token into b,tok;
 perform public.desk_action(g,'replace',p_id=>h,p_target=>b);
 if not exists(select 1 from public.reservations where id=b and status='confirmed' and lookup_token=tok and agent_code='TEST') then raise exception 'Replacement lost guest token or agent'; end if;
 failed:=false;
 begin perform public.desk_action(g,'replace',p_id=>h,p_target=>b);exception when others then failed:=true;end;
 if not failed then raise exception 'Duplicate replacement accepted'; end if;
 perform public.desk_action(g,'checkin',p_id=>b);
 h:=public.desk_action(g,'hold',p_name=>'KIM JEE WEON',p_code=>'TEST');perform public.desk_action(g,'confirm',p_id=>h);
 failed:=false;
 begin perform public.desk_action(g,'checkin',p_id=>h);exception when others then failed:=true;end;
 if not failed then raise exception 'Hold check-in accepted'; end if;
 h:=public.desk_action(g,'hold',p_name=>'LEE DAE JIN',p_code=>'TEST');perform public.desk_action(g,'confirm',p_id=>h);
 failed:=false;
 begin perform public.desk_action(g,'hold',p_name=>'LEE DAE JIN',p_code=>'TEST');exception when others then failed:=true;end;
 if not failed then raise exception 'Overcapacity hold accepted'; end if;
 failed:=false;
 begin perform public.desk_action(g,'level4',p_count=>7);exception when others then failed:=true;end;
 if not failed then raise exception 'Overcapacity continuing count accepted'; end if;
 perform set_config('request.jwt.claim.sub','',true);
 failed:=false;
 begin perform public.desk_action(g,'cancel',p_id=>h);exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthenticated action accepted'; end if;
 if has_function_privilege('anon','public.desk_action(uuid,text,uuid,uuid,text,text,integer)','EXECUTE') then raise exception 'Anonymous execute grant'; end if;
 if has_function_privilege('authenticated','public.desk_telegram_decide(uuid,text,text)','EXECUTE') then raise exception 'Telegram service RPC exposed'; end if;
end $$;
select 'PASS: replacement token, duplicate replacement, hold check-in, capacity, continuing count, auth and grants' as result;
