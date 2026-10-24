-- Allow signed VND ledger balances while preserving foreign-inventory controls.
begin;
alter table public.dream_exchange_accounts
  drop constraint dream_exchange_accounts_balance_minor_check,
  drop constraint dream_exchange_accounts_book_vnd_check,
  add constraint dream_exchange_accounts_balance_minor_check check (
    abs(balance_minor) <= 9000000000000 and (account in ('VND_CASH','VND_BANK') or balance_minor >= 0)),
  add constraint dream_exchange_accounts_book_vnd_check check (
    abs(book_vnd) <= 9000000000000 and (account in ('VND_CASH','VND_BANK') or book_vnd >= 0));

-- Patch only the two guards in the installed function, preserving later upgrades.
do $patch$
declare definition text;
begin
  definition := pg_get_functiondef('public.dream_exchange_commit(text,bigint,uuid,jsonb,bigint)'::regprocedure);
  if position('if v_after<0 or v_after>9000000000000' in definition) = 0
     or position('if v_after_book<0 or v_after_book>9000000000000' in definition) = 0 then
    raise exception 'Unexpected exchange commit definition; review before applying';
  end if;
  definition := replace(definition, 'if v_after<0 or v_after>9000000000000',
    'if (v_account not in (''VND_CASH'',''VND_BANK'') and v_after<0) or abs(v_after)>9000000000000');
  definition := replace(definition, 'if v_after_book<0 or v_after_book>9000000000000',
    'if (v_account not in (''VND_CASH'',''VND_BANK'') and v_after_book<0) or abs(v_after_book)>9000000000000');
  execute definition;
end;
$patch$;
commit;
