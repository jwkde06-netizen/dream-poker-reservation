-- Staff handover notes, separate from all balances and income.
create table public.dream_exchange_memos (
 chat_id text not null, number integer not null, body text not null check(length(body) between 1 and 200),
 bot_id text not null, update_id bigint not null, sender_id text not null,
 created_at timestamptz not null default now(), deleted_at timestamptz,
 primary key(chat_id,number), unique(bot_id,update_id)
);
alter table public.dream_exchange_memos enable row level security;
revoke all on public.dream_exchange_memos from public,anon,authenticated,service_role;
grant select on public.dream_exchange_memos to service_role;

create or replace function public.dream_exchange_memo_command(p_bot_id text,p_update_id bigint,p_owner uuid,p_action text,p_body text default null,p_number integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.dream_exchange_jobs; n integer; reply text; notes text;
begin
 select * into strict j from public.dream_exchange_jobs where bot_id=p_bot_id and update_id=p_update_id for update;
 if j.status='ignored' then return to_jsonb(j); end if;
 if j.status<>'processing' or j.owner is distinct from p_owner or j.lease_until<=now() then raise exception 'exchange_lease_lost'; end if;
 perform pg_advisory_xact_lock(hashtextextended('exchange-memo:'||j.chat_id,0));
 if p_action='add' then
  if p_body is null or length(trim(p_body)) not between 1 and 200 then raise exception 'memo_invalid_body'; end if;
  if (select count(*) from public.dream_exchange_memos where chat_id=j.chat_id and deleted_at is null)>=10 then
   reply:='비고는 최대 10개입니다. /memodel 번호로 기존 비고를 삭제해주세요.';
  else
   select coalesce(max(number),0)+1 into n from public.dream_exchange_memos where chat_id=j.chat_id;
   insert into public.dream_exchange_memos(chat_id,number,body,bot_id,update_id,sender_id) values(j.chat_id,n,trim(p_body),j.bot_id,j.update_id,j.sender_id);
   reply:='✅ 비고 #'||n||' 추가 완료';
  end if;
 elsif p_action='delete' then
  update public.dream_exchange_memos set deleted_at=now() where chat_id=j.chat_id and number=p_number and deleted_at is null;
  reply:=case when found then '✅ 비고 #'||p_number||' 삭제 완료' else '해당 비고가 없거나 이미 삭제되었습니다.' end;
 elsif p_action='list' then reply:='📝 비고';
 else raise exception 'memo_invalid_action';
 end if;
 select string_agg('#'||number||' · '||body,E'\n' order by number) into notes from public.dream_exchange_memos where chat_id=j.chat_id and deleted_at is null;
 reply:=reply||E'\n\n'||coalesce(notes,'등록된 비고가 없습니다.')||E'\n\n/memo 내용 · 추가\n/memodel 번호 · 삭제';
 update public.dream_exchange_jobs set status='ignored',reply_text=reply,lease_until=null where bot_id=j.bot_id and update_id=j.update_id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function public.dream_exchange_memo_command(text,bigint,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.dream_exchange_memo_command(text,bigint,uuid,text,text,integer) to service_role;

create or replace function public.dream_exchange_report_with_carry(p_chat_id text,p_from date,p_to date)
returns jsonb language sql stable security definer set search_path='' as $$
with base as (select public.dream_exchange_report(p_chat_id,p_from,p_to) as data),
carry as (select coalesce(sum(c.fee_vnd),0)::bigint as fee,coalesce(sum(c.fx_vnd),0)::bigint as fx
 from public.dream_exchange_profit_carry c where c.chat_id=p_chat_id and c.week_start>=p_from and c.week_start<=p_to)
select jsonb_set(jsonb_set(jsonb_set(base.data,'{fee_vnd}',to_jsonb((base.data->>'fee_vnd')::bigint+carry.fee)),
'{realized_fx_vnd}',to_jsonb((base.data->>'realized_fx_vnd')::bigint+carry.fx)),
'{net_known_vnd}',to_jsonb((base.data->>'net_known_vnd')::bigint+carry.fee+carry.fx))
||jsonb_build_object('memos',coalesce((select jsonb_agg(jsonb_build_object('number',number,'body',body) order by number) from public.dream_exchange_memos where chat_id=p_chat_id and deleted_at is null),'[]'::jsonb))
from base cross join carry
$$;
revoke all on function public.dream_exchange_report_with_carry(text,date,date) from public,anon,authenticated;
grant execute on function public.dream_exchange_report_with_carry(text,date,date) to service_role;