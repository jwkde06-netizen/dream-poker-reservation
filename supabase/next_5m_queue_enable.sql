-- Starts_at remains a storage compatibility field; the UI never presents it as
-- an actual start time for this queue. Its arrival window is relative to now.
insert into public.reservation_games(title,starts_at,capacity,is_open,table_no,game_no,description,is_default_queue)
select '다음 5M 게임',now(),9,true,'','','시작 시간 추후 안내 · 실제 게임 배정 후 직원 확정',true
where not exists(select 1 from public.reservation_games where is_default_queue);
