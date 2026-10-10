-- Apply in the reservation project's Supabase SQL editor before deploying the assignment UI.
-- Staff/admin only: relocate a reservation to an existing open game without changing its status.
create or replace function public.assign_poker_reservation_game(p_id uuid, p_game uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  source_game uuid;
  target_capacity integer;
  occupied integer;
  booking_status text;
begin
  if actor_id is null or not exists (
    select 1 from public.user_profiles
    where user_id = actor_id and active = true and role in ('admin','staff')
  ) then
    raise exception 'Staff access required';
  end if;
  select game_id, status into source_game, booking_status
  from public.reservations where id = p_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if source_game = p_game then return; end if;
  select capacity into target_capacity from public.reservation_games
  where id = p_game and is_open = true for update;
  if not found then raise exception 'Target game is unavailable'; end if;
  if booking_status in ('confirmed','checked_in') then
    select count(*) into occupied from public.reservations
    where game_id = p_game and status in ('confirmed','checked_in');
    if occupied >= target_capacity then raise exception 'Target game is full'; end if;
  end if;
  update public.reservations set game_id = p_game where id = p_id;
end;
$$;
revoke all on function public.assign_poker_reservation_game(uuid,uuid) from public;
grant execute on function public.assign_poker_reservation_game(uuid,uuid) to authenticated;
