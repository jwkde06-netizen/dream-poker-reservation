-- Run only after the replacement UI and worker are deployed and verified.
-- Old clients must refresh into the new version-aware UI rather than overwrite changes.
create or replace function public.manage_poker_reservation(p_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin raise exception 'Please reload this page to use the updated reservation desk.'; end $$;


-- Retire guest-token delivery claims; booking lookup/cancellation remain unchanged.
revoke all on function public.claim_poker_telegram_notification(uuid),public.confirm_poker_telegram_notification(uuid) from public,anon,authenticated;

-- Suppress initial notifications already delivered by legacy clients during rollout.
update reservation_private.outbox o set state='sent',sent_at=r.telegram_notified_at from public.reservations r where o.reservation_id=r.id and o.version=0 and o.state='queued' and r.telegram_notified_at is not null;
update reservation_private.settings set enabled=true where id;
select cron.schedule('dream-reservation-delivery','* * * * *','select reservation_private.dispatch()');
