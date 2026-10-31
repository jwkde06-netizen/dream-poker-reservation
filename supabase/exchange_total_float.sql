-- Reference capital only. Never post to accounts, events, journal or income.
alter table public.dream_exchange_rooms add column total_float_vnd bigint
 check (total_float_vnd between 0 and 9000000000000);
create or replace function public.dream_exchange_set_float(p_bot_id text,p_update_id bigint,p_owner uuid,p_amount bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.dream_exchange_jobs;
begin
 select * into strict j from public.dream_exchange_jobs where bot_id=p_bot_id and update_id=p_update_id for update;
 if j.status='ignored' then return to_jsonb(j); end if;
 if j.status<>'processing' or j.owner is distinct from p_owner or j.lease_until<=now() then raise exception 'exchange_lease_lost'; end if;
 if p_amount is null or p_amount<0 or p_amount>9000000000000 then raise exception 'exchange_invalid_float'; end if;
 update public.dream_exchange_rooms set total_float_vnd=p_amount where chat_id=j.chat_id;
 if not found then raise exception 'exchange_room_required'; end if;
 update public.dream_exchange_jobs set status='ignored',intent=jsonb_build_object('kind','float_setting','amount_vnd',p_amount),
 reply_text='✅ 총 유통 시제 '||to_char(p_amount,'FM999,999,999,999,990')||E'동으로 설정했습니다.\n통화별 잔액과 이번 주 수익은 변경하지 않았습니다.',lease_until=null
 where bot_id=j.bot_id and update_id=j.update_id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.dream_exchange_set_float(text,bigint,uuid,bigint) from public,anon,authenticated;
grant execute on function public.dream_exchange_set_float(text,bigint,uuid,bigint) to service_role;

create or replace function public.dream_exchange_report_with_carry(p_chat_id text,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
with base as (select public.dream_exchange_report(p_chat_id,p_from,p_to) as data),
carry as (select coalesce(sum(c.fee_vnd),0)::bigint as fee,coalesce(sum(c.fx_vnd),0)::bigint as fx
 from public.dream_exchange_profit_carry c where c.chat_id=p_chat_id and c.week_start>=p_from and c.week_start<=p_to)
select jsonb_set(jsonb_set(jsonb_set(base.data,'{fee_vnd}',to_jsonb((base.data->>'fee_vnd')::bigint+carry.fee)),
'{realized_fx_vnd}',to_jsonb((base.data->>'realized_fx_vnd')::bigint+carry.fx)),
'{net_known_vnd}',to_jsonb((base.data->>'net_known_vnd')::bigint+carry.fee+carry.fx))
||jsonb_build_object('memos',coalesce((select jsonb_agg(jsonb_build_object('number',number,'body',body) order by number) from public.dream_exchange_memos where chat_id=p_chat_id and deleted_at is null),'[]'::jsonb),
'total_float_vnd',(select total_float_vnd from public.dream_exchange_rooms where chat_id=p_chat_id))
from base cross join carry
$$;
revoke all on function public.dream_exchange_report_with_carry(text,date,date) from public,anon,authenticated;
grant execute on function public.dream_exchange_report_with_carry(text,date,date) to service_role;