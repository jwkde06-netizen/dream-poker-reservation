-- Run in the Supabase SQL editor before activating Telegram approval buttons.
-- The service-role-only function serializes confirmations per game.
create or replace function public.telegram_decide_poker_reservation(
 p_id uuid, p_status text, p_actor text
) returns text language plpgsql security definer set search_path=public as $$
declare v_game uuid; v_capacity integer; v_current text; v_count integer;
begin
 if auth.role() <> 'service_role' then raise exception 'Not authorized'; end if;
 if p_status not in ('confirmed','rejected') then raise exception 'Invalid status'; end if;
 select game_id,status into v_game,v_current from reservations where id=p_id;
 if not found then return 'missing'; end if;
 -- Lock the game to serialize approvals to the same table.
 select capacity into v_capacity from reservation_games where id=v_game for update;
 select status into v_current from reservations where id=p_id for update;
 if v_current <> 'pending' then return 'already_' || v_current; end if;
 if p_status='confirmed' then
   select count(*) into v_count from reservations
    where game_id=v_game and status in ('confirmed','checked_in');
   if v_count >= v_capacity then return 'full'; end if;
 end if;
 update reservations set status=p_status where id=p_id and status='pending';
 -- Existing reservation auditing triggers (if configured) remain authoritative.
 return p_status;
end $$;
revoke all on function public.telegram_decide_poker_reservation(uuid,text,text) from public, anon, authenticated;
grant execute on function public.telegram_decide_poker_reservation(uuid,text,text) to service_role;
