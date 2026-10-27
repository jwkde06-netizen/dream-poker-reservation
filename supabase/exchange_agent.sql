-- Dream Poker Exchange. Apply once before enabling the separate Exchange webhook.
-- No historical balances or messages are imported. All APIs below are service-only.
begin;

create table if not exists public.dream_exchange_rooms (
  chat_id text primary key,
  initialized boolean not null default false,
  version bigint not null default 0 check (version >= 0),
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.dream_exchange_accounts (
  chat_id text not null references public.dream_exchange_rooms(chat_id),
  account text not null check (account in ('VND_CASH','VND_BANK','KRW_BANK','USD_CASH')),
  balance_minor numeric(20,0) not null default 0 check (balance_minor between 0 and 9000000000000),
  book_vnd numeric(20,0) default 0 check (book_vnd between 0 and 9000000000000),
  primary key (chat_id,account),
  check (account not in ('VND_CASH','VND_BANK') or (book_vnd is not null and book_vnd = balance_minor)),
  check (balance_minor <> 0 or (book_vnd is not null and book_vnd = 0))
);
create table if not exists public.dream_exchange_jobs (
  bot_id text not null check (bot_id ~ '^[0-9]+$'),
  update_id bigint not null check (update_id >= 0),
  chat_id text not null,
  message_id bigint not null,
  sender_id text not null,
  source_date timestamptz not null,
  raw_text text not null check (length(raw_text) <= 4096),
  status text not null default 'received' check (status in ('received','processing','review','ignored','applied','failed','resolved')),
  owner uuid,
  lease_until timestamptz,
  intent jsonb,
  plan jsonb,
  reference text,
  resolved_by_update_id bigint,
  context_update_id bigint,
  reply_text text,
  reply_id bigint,
  reply_state text not null default 'unsent' check (reply_state in ('unsent','sending','sent','uncertain')),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bot_id,update_id)
);
create index if not exists dream_exchange_jobs_context on public.dream_exchange_jobs(chat_id,bot_id,message_id);
create index if not exists dream_exchange_jobs_reply on public.dream_exchange_jobs(chat_id,bot_id,reply_id) where reply_id is not null;
create index if not exists dream_exchange_jobs_review on public.dream_exchange_jobs(chat_id,status,source_date);

create table if not exists public.dream_exchange_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  chat_id text not null references public.dream_exchange_rooms(chat_id),
  reference text not null,
  bot_id text not null,
  update_id bigint not null,
  message_id bigint not null,
  sender_id text not null,
  source_date timestamptz not null,
  business_date date not null,
  kind text not null check (kind in ('opening','exchange','movement','reversal')),
  external_reference text,
  reverses_id uuid unique references public.dream_exchange_events(id),
  fee_vnd numeric(20,0) not null,
  fx_profit_vnd numeric(20,0),
  expense_vnd numeric(20,0) not null,
  capital_vnd numeric(20,0),
  valuation_incomplete boolean not null,
  version_after bigint not null,
  plan jsonb not null,
  created_at timestamptz not null default now(),
  unique (bot_id,update_id),
  unique (chat_id,reference),
  unique (chat_id,version_after),
  foreign key (bot_id,update_id) references public.dream_exchange_jobs(bot_id,update_id)
);
create unique index if not exists dream_exchange_external_reference on public.dream_exchange_events(chat_id,external_reference) where external_reference is not null;
create index if not exists dream_exchange_events_period on public.dream_exchange_events(chat_id,business_date,sequence);

create table if not exists public.dream_exchange_postings (
  event_id uuid not null references public.dream_exchange_events(id),
  account text not null check (account in ('VND_CASH','VND_BANK','KRW_BANK','USD_CASH')),
  amount_minor numeric(20,0) not null check (amount_minor <> 0),
  book_delta_vnd numeric(20,0),
  before_minor numeric(20,0) not null,
  before_book_vnd numeric(20,0),
  after_minor numeric(20,0) not null,
  after_book_vnd numeric(20,0),
  primary key (event_id,account)
);
create table if not exists public.dream_exchange_journal (
  event_id uuid not null references public.dream_exchange_events(id),
  line_no integer not null,
  account text not null check (account in ('VND_CASH','VND_BANK','KRW_BANK','USD_CASH','OPENING_EQUITY','CAPITAL_EQUITY','FEE_REVENUE','FX_REVENUE','OPERATING_EXPENSE')),
  debit_vnd numeric(20,0), -- null is an explicitly unvalued entry, never assumed to be zero.
  primary key (event_id,line_no)
);

alter table public.dream_exchange_rooms enable row level security;
alter table public.dream_exchange_accounts enable row level security;
alter table public.dream_exchange_jobs enable row level security;
alter table public.dream_exchange_events enable row level security;
alter table public.dream_exchange_postings enable row level security;
alter table public.dream_exchange_journal enable row level security;
revoke all on public.dream_exchange_rooms,public.dream_exchange_accounts,public.dream_exchange_jobs,public.dream_exchange_events,public.dream_exchange_postings,public.dream_exchange_journal from public,anon,authenticated,service_role;
grant select on public.dream_exchange_rooms,public.dream_exchange_accounts,public.dream_exchange_events,public.dream_exchange_postings,public.dream_exchange_journal to service_role;
grant select,update on public.dream_exchange_jobs to service_role;

create or replace function public.dream_exchange_immutable() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Exchange ledger is append-only; use a reversal'; end;
$$;
drop trigger if exists dream_exchange_events_immutable on public.dream_exchange_events;
create trigger dream_exchange_events_immutable before update or delete on public.dream_exchange_events for each row execute function public.dream_exchange_immutable();
drop trigger if exists dream_exchange_postings_immutable on public.dream_exchange_postings;
create trigger dream_exchange_postings_immutable before update or delete on public.dream_exchange_postings for each row execute function public.dream_exchange_immutable();
drop trigger if exists dream_exchange_journal_immutable on public.dream_exchange_journal;
create trigger dream_exchange_journal_immutable before update or delete on public.dream_exchange_journal for each row execute function public.dream_exchange_immutable();
create or replace function public.dream_exchange_job_source_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if row(new.bot_id,new.update_id,new.chat_id,new.message_id,new.sender_id,new.source_date,new.raw_text)
     is distinct from row(old.bot_id,old.update_id,old.chat_id,old.message_id,old.sender_id,old.source_date,old.raw_text) then
    raise exception 'Exchange source messages are immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists dream_exchange_jobs_source_immutable on public.dream_exchange_jobs;
create trigger dream_exchange_jobs_source_immutable before update on public.dream_exchange_jobs for each row execute function public.dream_exchange_job_source_immutable();

create or replace function public.dream_exchange_claim(
  p_bot_id text,p_update_id bigint,p_chat_id text,p_message_id bigint,p_sender_id text,p_source_date timestamptz,p_text text,p_owner uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.dream_exchange_jobs;
begin
  if p_bot_id !~ '^[0-9]+$' or p_update_id < 0 or p_message_id <= 0 or p_sender_id !~ '^[0-9]+$' or length(p_text)>4096 then raise exception 'exchange_invalid_source'; end if;
  insert into public.dream_exchange_jobs(bot_id,update_id,chat_id,message_id,sender_id,source_date,raw_text)
  values(p_bot_id,p_update_id,p_chat_id,p_message_id,p_sender_id,p_source_date,p_text) on conflict do nothing;
  select * into strict j from public.dream_exchange_jobs where bot_id=p_bot_id and update_id=p_update_id for update;
  if j.chat_id<>p_chat_id or j.message_id<>p_message_id or j.sender_id<>p_sender_id or j.raw_text<>p_text or j.source_date<>p_source_date then raise exception 'exchange_source_mismatch'; end if;
  if j.status in ('review','ignored','applied','failed','resolved') then return jsonb_build_object('disposition','finished','job',to_jsonb(j)); end if;
  if j.status='processing' and j.lease_until>now() then return jsonb_build_object('disposition','busy'); end if;
  update public.dream_exchange_jobs set status='processing',owner=p_owner,lease_until=now()+interval '3 minutes'
    where bot_id=p_bot_id and update_id=p_update_id returning * into j;
  return jsonb_build_object('disposition','claimed','job',to_jsonb(j));
end;
$$;

create or replace function public.dream_exchange_claim_reply(p_bot_id text,p_update_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.dream_exchange_jobs set reply_state='sending' where bot_id=p_bot_id and update_id=p_update_id
    and status in ('review','ignored','applied','failed','resolved') and reply_state='unsent' and coalesce(reply_text,'')<>'';
  return found;
end;
$$;

create or replace function public.dream_exchange_state(p_chat_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'initialized',coalesce((select initialized from public.dream_exchange_rooms where chat_id=p_chat_id),false),
  'version',coalesce((select version from public.dream_exchange_rooms where chat_id=p_chat_id),0),
  'opened_at',(select opened_at from public.dream_exchange_rooms where chat_id=p_chat_id),
  'accounts',(select jsonb_object_agg(c.account,jsonb_build_object('balance_minor',coalesce(a.balance_minor,0),'book_vnd',case when a.account is null then 0 else a.book_vnd end))
    from (values ('VND_CASH'),('VND_BANK'),('KRW_BANK'),('USD_CASH')) c(account)
    left join public.dream_exchange_accounts a on a.chat_id=p_chat_id and a.account=c.account)
);
$$;

-- All effects of a money request, including completing its job and resolving a prior
-- clarification, commit together. A room row lock serializes concurrent balance changes.
create or replace function public.dream_exchange_commit(
  p_bot_id text,p_update_id bigint,p_owner uuid,p_plan jsonb,p_resolves_update_id bigint default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.dream_exchange_jobs; pending public.dream_exchange_jobs;
  room public.dream_exchange_rooms; a public.dream_exchange_accounts;
  original public.dream_exchange_events; ev public.dream_exchange_events;
  p jsonb; q jsonb; v_account text; v_kind text; v_ref text; v_external text;
  v_amount numeric; v_delta numeric; v_after numeric; v_after_book numeric;
  v_fee numeric; v_fx numeric; v_expense numeric; v_capital numeric; v_asset_sum numeric:=0;
  v_known boolean:=true; v_journal jsonb:='[]'::jsonb; v_line integer:=0;
  v_resolve_ids bigint[]:='{}'::bigint[]; v_next bigint; v_depth integer:=0; v_resolution_kind text;
begin
  select * into strict j from public.dream_exchange_jobs where bot_id=p_bot_id and update_id=p_update_id for update;
  if j.status='applied' then
    select * into strict ev from public.dream_exchange_events where bot_id=p_bot_id and update_id=p_update_id;
    return jsonb_build_object('ok',true,'duplicate',true,'event',to_jsonb(ev));
  end if;
  if j.status<>'processing' or j.owner is distinct from p_owner or j.lease_until<=now() then raise exception 'exchange_lease_lost'; end if;
  if p_resolves_update_id is not null then
    if p_resolves_update_id=p_update_id then raise exception 'exchange_invalid_resolution'; end if;
    if j.context_update_id is distinct from p_resolves_update_id then raise exception 'exchange_invalid_resolution'; end if;
    v_next:=p_resolves_update_id;
    loop
      v_depth:=v_depth+1;
      if v_depth>8 or v_next=any(v_resolve_ids) then raise exception 'exchange_invalid_resolution'; end if;
      select * into strict pending from public.dream_exchange_jobs where bot_id=p_bot_id and update_id=v_next and chat_id=j.chat_id for update;
      if pending.status<>'review' then raise exception 'exchange_already_resolved'; end if;
      if v_depth=1 then v_resolution_kind:=pending.intent->>'kind'; end if;
      v_resolve_ids:=array_append(v_resolve_ids,v_next);
      if pending.context_update_id is null then exit; end if;
      v_next:=pending.context_update_id;
    end loop;
  end if;
  insert into public.dream_exchange_rooms(chat_id) values(j.chat_id) on conflict do nothing;
  select * into strict room from public.dream_exchange_rooms where chat_id=j.chat_id for update;
  if jsonb_typeof(p_plan->'version') is distinct from 'number' or (p_plan->>'version')::numeric<>room.version then raise exception 'exchange_stale'; end if;
  v_kind:=p_plan->>'kind';
  if v_kind is null or v_kind not in ('opening','exchange','movement','reversal') then raise exception 'exchange_invalid_kind'; end if;
  if v_kind='opening' then
    if room.initialized or p_resolves_update_id is null or v_resolution_kind is distinct from 'opening' then raise exception 'exchange_opening_confirmation_required'; end if;
  elsif not room.initialized then raise exception 'exchange_opening_required';
  elsif j.source_date<room.opened_at then raise exception 'exchange_before_opening';
  end if;
  if jsonb_typeof(p_plan->'postings') is distinct from 'array' or jsonb_array_length(p_plan->'postings')>4
     or (v_kind<>'opening' and jsonb_array_length(p_plan->'postings')=0) then raise exception 'exchange_invalid_postings'; end if;
  if (select count(distinct value->>'account') from jsonb_array_elements(p_plan->'postings'))<>jsonb_array_length(p_plan->'postings') then raise exception 'exchange_duplicate_account'; end if;
  v_fee:=(p_plan->>'fee_vnd')::numeric; v_fx:=(p_plan->>'fx_profit_vnd')::numeric;
  v_expense:=(p_plan->>'expense_vnd')::numeric; v_capital:=(p_plan->>'capital_vnd')::numeric;
  if v_fee is null or v_expense is null then raise exception 'exchange_invalid_totals'; end if;
  for q in select value from jsonb_array_elements(jsonb_build_array(v_fee,v_fx,v_expense,v_capital)) loop
    if q<>'null'::jsonb and (abs((q#>>'{}')::numeric)>9000000000000 or (q#>>'{}')::numeric<>trunc((q#>>'{}')::numeric)) then raise exception 'exchange_invalid_money'; end if;
  end loop;
  if v_kind<>'reversal' and (v_fee<0 or v_expense<0) then raise exception 'exchange_invalid_totals'; end if;
  if v_kind='opening' and (v_fee<>0 or v_expense<>0 or v_fx is distinct from 0::numeric) then raise exception 'exchange_invalid_opening'; end if;
  if v_kind='reversal' then
    select * into strict original from public.dream_exchange_events where chat_id=j.chat_id and reference=p_plan->>'reverses_reference';
    if original.kind in ('opening','reversal') or exists(select 1 from public.dream_exchange_events where reverses_id=original.id) then raise exception 'exchange_already_reversed'; end if;
    if row(v_fee,v_fx,v_expense,v_capital) is distinct from row(-original.fee_vnd,-original.fx_profit_vnd,-original.expense_vnd,-original.capital_vnd) then raise exception 'exchange_invalid_reversal'; end if;
    if jsonb_array_length(p_plan->'postings')<>(select count(*) from public.dream_exchange_postings where event_id=original.id) then raise exception 'exchange_invalid_reversal'; end if;
    if exists(select 1 from public.dream_exchange_postings op
      join public.dream_exchange_postings later on later.account=op.account
      join public.dream_exchange_events le on le.id=later.event_id
      where op.event_id=original.id and op.account in ('KRW_BANK','USD_CASH') and le.chat_id=j.chat_id and le.sequence>original.sequence
        and le.kind<>'reversal' and not exists(select 1 from public.dream_exchange_events lr where lr.reverses_id=le.id)) then
      raise exception 'exchange_foreign_reversal_requires_reconciliation';
    end if;
  elsif coalesce(p_plan->>'reverses_reference','')<>'' then raise exception 'exchange_invalid_reversal'; end if;

  insert into public.dream_exchange_accounts(chat_id,account)
    select j.chat_id,code from unnest(array['VND_CASH','VND_BANK','KRW_BANK','USD_CASH']) code on conflict do nothing;
  for p in select value from jsonb_array_elements(p_plan->'postings') loop
    v_account:=p->>'account';
    if v_account not in ('VND_CASH','VND_BANK','KRW_BANK','USD_CASH') then raise exception 'exchange_invalid_account'; end if;
    select * into strict a from public.dream_exchange_accounts where chat_id=j.chat_id and account=v_account for update;
    v_amount:=(p->>'amount_minor')::numeric; v_delta:=(p->>'book_delta_vnd')::numeric;
    if v_amount is null or v_amount=0 or abs(v_amount)>9000000000000 or v_amount<>trunc(v_amount)
       or (v_delta is not null and (abs(v_delta)>9000000000000 or v_delta<>trunc(v_delta))) then raise exception 'exchange_invalid_money'; end if;
    if (p->>'before_minor')::numeric is distinct from a.balance_minor or (p->>'before_book_vnd')::numeric is distinct from a.book_vnd then raise exception 'exchange_stale'; end if;
    v_after:=a.balance_minor+v_amount;
    if v_after<0 or v_after>9000000000000 then raise exception 'exchange_insufficient_balance'; end if;
    v_after_book:=case when v_after=0 then 0 when a.book_vnd is null or v_delta is null then null else a.book_vnd+v_delta end;
    if v_after_book<0 or v_after_book>9000000000000 then raise exception 'exchange_invalid_basis'; end if;
    if (p->>'after_minor')::numeric is distinct from v_after or (p->>'after_book_vnd')::numeric is distinct from v_after_book then raise exception 'exchange_invalid_after'; end if;
    if v_account in ('VND_CASH','VND_BANK') and (v_delta is distinct from v_amount or v_after_book is distinct from v_after) then raise exception 'exchange_invalid_vnd_basis'; end if;
    if v_kind='opening' and v_amount<0 then raise exception 'exchange_invalid_opening'; end if;
    if v_kind='reversal' and not exists(select 1 from public.dream_exchange_postings op where op.event_id=original.id and op.account=v_account and op.amount_minor=-v_amount and op.book_delta_vnd is not distinct from -v_delta) then raise exception 'exchange_invalid_reversal'; end if;
    v_known:=v_known and v_delta is not null;
    v_asset_sum:=v_asset_sum+coalesce(v_delta,0);
    v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account',v_account,'debit_vnd',v_delta));
  end loop;
  v_known:=v_known and v_fx is not null and v_capital is not null;
  if v_known and v_asset_sum<>v_fee+v_fx-v_expense+v_capital then raise exception 'exchange_unbalanced_journal'; end if;
  if v_kind='opening' or v_capital is distinct from 0::numeric then v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account',case when v_kind='opening' then 'OPENING_EQUITY' else 'CAPITAL_EQUITY' end,'debit_vnd',-v_capital)); end if;
  if v_fee<>0 then v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account','FEE_REVENUE','debit_vnd',-v_fee)); end if;
  if v_fx is distinct from 0::numeric then v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account','FX_REVENUE','debit_vnd',-v_fx)); end if;
  if v_expense<>0 then v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account','OPERATING_EXPENSE','debit_vnd',v_expense)); end if;
  p_plan:=jsonb_set(jsonb_set(p_plan,'{journal}',v_journal),'{valuation_incomplete}',to_jsonb(not v_known));
  v_ref:='FX-'||p_bot_id||'-'||p_update_id::text;
  v_external:=nullif(trim(p_plan->>'external_reference'),'');
  if v_external is not null and (length(v_external)>100 or exists(select 1 from public.dream_exchange_events where chat_id=j.chat_id and external_reference=v_external)) then raise exception 'exchange_duplicate_external_reference'; end if;
  insert into public.dream_exchange_events(chat_id,reference,bot_id,update_id,message_id,sender_id,source_date,business_date,kind,external_reference,reverses_id,fee_vnd,fx_profit_vnd,expense_vnd,capital_vnd,valuation_incomplete,version_after,plan)
    values(j.chat_id,v_ref,p_bot_id,p_update_id,j.message_id,j.sender_id,j.source_date,(j.source_date at time zone 'Asia/Ho_Chi_Minh')::date,v_kind,v_external,original.id,v_fee,v_fx,v_expense,v_capital,not v_known,room.version+1,p_plan) returning * into ev;
  for p in select value from jsonb_array_elements(p_plan->'postings') loop
    insert into public.dream_exchange_postings(event_id,account,amount_minor,book_delta_vnd,before_minor,before_book_vnd,after_minor,after_book_vnd)
      values(ev.id,p->>'account',(p->>'amount_minor')::numeric,(p->>'book_delta_vnd')::numeric,(p->>'before_minor')::numeric,(p->>'before_book_vnd')::numeric,(p->>'after_minor')::numeric,(p->>'after_book_vnd')::numeric);
    update public.dream_exchange_accounts set balance_minor=(p->>'after_minor')::numeric,book_vnd=(p->>'after_book_vnd')::numeric where chat_id=j.chat_id and account=p->>'account';
  end loop;
  for p in select value from jsonb_array_elements(v_journal) loop
    v_line:=v_line+1;
    insert into public.dream_exchange_journal(event_id,line_no,account,debit_vnd) values(ev.id,v_line,p->>'account',(p->>'debit_vnd')::numeric);
  end loop;
  update public.dream_exchange_rooms set initialized=true,version=room.version+1,opened_at=case when v_kind='opening' then j.source_date else opened_at end where chat_id=j.chat_id;
  update public.dream_exchange_jobs set status='applied',plan=p_plan,reference=v_ref,lease_until=null where bot_id=p_bot_id and update_id=p_update_id;
  if p_resolves_update_id is not null then update public.dream_exchange_jobs set status='resolved',resolved_by_update_id=p_update_id where bot_id=p_bot_id and update_id=any(v_resolve_ids); end if;
  return jsonb_build_object('ok',true,'duplicate',false,'event',to_jsonb(ev));
end;
$$;

create or replace function public.dream_exchange_report(p_chat_id text,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'exchange_invalid_report_period'; end if;
  select jsonb_build_object(
    'from',p_from,'to',p_to,
    'initialized',coalesce((select initialized from public.dream_exchange_rooms where chat_id=p_chat_id),false),
    'opened_at',(select opened_at from public.dream_exchange_rooms where chat_id=p_chat_id),
    'period_fully_covered',coalesce((select opened_at<=(p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') from public.dream_exchange_rooms where chat_id=p_chat_id),false),
    'fee_vnd',coalesce(sum(e.fee_vnd),0),
    'realized_fx_vnd',coalesce(sum((case when e.kind='movement' or (e.kind='reversal' and exists(select 1 from public.dream_exchange_events original where original.id=e.reverses_id and original.kind='movement')) then e.fx_profit_vnd else 0 end)),0),
    'expense_vnd',coalesce(sum(e.expense_vnd),0),
    'net_known_vnd',coalesce(sum(e.fee_vnd+coalesce((case when e.kind='movement' or (e.kind='reversal' and exists(select 1 from public.dream_exchange_events original where original.id=e.reverses_id and original.kind='movement')) then e.fx_profit_vnd else 0 end),0)-e.expense_vnd),0),
    'transaction_count',count(*) filter (where e.kind not in ('opening','reversal')),
    'reversal_count',count(*) filter (where e.kind='reversal'),
    'unvalued_fx_count',count(*) filter (where (case when e.kind='movement' or (e.kind='reversal' and exists(select 1 from public.dream_exchange_events original where original.id=e.reverses_id and original.kind='movement')) then e.fx_profit_vnd else 0 end) is null and e.kind<>'reversal' and not exists(select 1 from public.dream_exchange_events r where r.reverses_id=e.id and r.business_date<=p_to)),
    'unresolved_count',(select count(*) from public.dream_exchange_jobs j where j.chat_id=p_chat_id and j.status in ('review','failed') and (j.source_date at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to),
    'unvalued_holdings',(select count(*) from public.dream_exchange_accounts a where a.chat_id=p_chat_id and a.balance_minor>0 and a.book_vnd is null),
    'balances',(select jsonb_object_agg(c.account,jsonb_build_object(
      'opening_minor',case when coalesce((select opened_at<=(p_from::timestamp at time zone 'Asia/Ho_Chi_Minh') from public.dream_exchange_rooms where chat_id=p_chat_id),false)
        then coalesce((select sum(p.amount_minor) from public.dream_exchange_postings p join public.dream_exchange_events v on v.id=p.event_id where v.chat_id=p_chat_id and p.account=c.account and v.business_date<p_from),0) else null end,
      'closing_minor',case when coalesce((select opened_at<((p_to+1)::timestamp at time zone 'Asia/Ho_Chi_Minh') from public.dream_exchange_rooms where chat_id=p_chat_id),false)
        then coalesce((select sum(p.amount_minor) from public.dream_exchange_postings p join public.dream_exchange_events v on v.id=p.event_id where v.chat_id=p_chat_id and p.account=c.account and v.business_date<=p_to),0) else null end
    )) from (values ('VND_CASH'),('VND_BANK'),('KRW_BANK'),('USD_CASH')) c(account))
  ) into result from public.dream_exchange_events e where e.chat_id=p_chat_id and e.business_date between p_from and p_to;
  return result;
end;
$$;

revoke execute on function public.dream_exchange_immutable(),public.dream_exchange_job_source_immutable() from public,anon,authenticated,service_role;
revoke execute on function public.dream_exchange_claim(text,bigint,text,bigint,text,timestamptz,text,uuid),public.dream_exchange_claim_reply(text,bigint),public.dream_exchange_state(text),public.dream_exchange_commit(text,bigint,uuid,jsonb,bigint),public.dream_exchange_report(text,date,date) from public,anon,authenticated;
grant execute on function public.dream_exchange_claim(text,bigint,text,bigint,text,timestamptz,text,uuid),public.dream_exchange_claim_reply(text,bigint),public.dream_exchange_state(text),public.dream_exchange_commit(text,bigint,uuid,jsonb,bigint),public.dream_exchange_report(text,date,date) to service_role;
commit;
