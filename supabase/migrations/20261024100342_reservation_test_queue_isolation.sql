-- Keep exactly one intake queue in each isolated environment.
-- Existing operational games remain unchanged; staff-only tests use their own queue.
drop index public.reservation_single_default_queue;
create unique index reservation_single_default_queue
  on public.reservation_games(is_test) where is_default_queue;
