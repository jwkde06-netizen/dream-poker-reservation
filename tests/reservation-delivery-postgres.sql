-- LOCAL PGlite only: delivery functions are disabled stubs in reservation-schema.sql.
-- Do not run this file against production.
begin;
do $$
declare actor uuid:=gen_random_uuid(); game uuid:=gen_random_uuid(); rid uuid; job uuid; response jsonb; claim jsonb; token uuid;
begin
 insert into auth.users(id,email) values(actor,'telegram-test@example.invalid');
 insert into user_profiles(user_id,role,active,display_name) values(actor,'cashier',true,'TEST CASHIER');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into reservation_games(id,title,starts_at,capacity,is_open,is_default_queue) values(game,'LOCAL DELIVERY TEST',now(),3,true,false);
 response:=submit_reservation_request(gen_random_uuid(),jsonb_build_object('game_id',game,'player_name_en','TEST DELIVERY','arrival_at',now()+interval '1 hour','party_size',2,'source','desk'));
 rid:=(response->>'reservation_id')::uuid;
 select id into job from reservation_private.outbox where reservation_id=rid and version=0;
 assert job is not null,'real bookings enqueue Telegram';
 update reservation_private.outbox set state='sent',chat_id='-1',message_id=101 where id=job;
 assert apply_reservation_telegram_action(job,'-2',101,'confirm',1,'TEST')->>'result'='stale','wrong Telegram room blocked';
 response:=apply_reservation_telegram_action(job,'-1',101,'confirm',1,'TEST');
 assert response->>'result'='confirmed';
 assert (select status='confirmed' and party_size=2 from reservations where id=rid),'Telegram changes canonical booking';
 assert apply_reservation_telegram_action(job,'-1',101,'confirm',1,'TEST')->>'result'='stale','replayed Telegram button cannot mutate again';
 assert (select count(*)=1 from reservation_audit where reservation_id=rid and telegram_actor_id=1),'Telegram identity audited once';
 select id into job from reservation_private.outbox where reservation_id=rid and version=1;
 update reservation_private.outbox set state='sent',chat_id='-1',message_id=101 where id=job;
 assert apply_reservation_telegram_action(job,'-1',101,'cancel',1,'TEST')->>'result'='cancelled';
 assert (select status='cancelled' from reservations where id=rid),'Telegram cancellation reflected in same row';
 update reservation_private.sheet_sync set enabled=true returning dispatch_token into token;
 claim:=claim_reservation_sheet(token);
 assert jsonb_array_length(claim->'rows')=1,'reservation export contains only canonical non-test rows';
 assert claim->'rows'->0->>'status'='cancelled','sheet snapshot uses latest state';
 assert claim_reservation_sheet(token) is null,'only one sheet worker lease';
 assert not finish_reservation_sheet(gen_random_uuid(),(claim->>'revision')::bigint,null),'wrong worker cannot finish';
 assert finish_reservation_sheet((claim->>'lease_id')::uuid,(claim->>'revision')::bigint,'TEST failure');
 assert (select synced_revision=0 and last_error='TEST failure' from reservation_private.sheet_sync),'failed delivery not marked successful';
 claim:=claim_reservation_sheet(token);
 assert finish_reservation_sheet((claim->>'lease_id')::uuid,(claim->>'revision')::bigint,null);
 assert (select synced_revision=revision and last_error is null from reservation_private.sheet_sync),'verified retry receipt saved';
end $$;
rollback;
