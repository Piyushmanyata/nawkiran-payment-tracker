-- Keep weekly UI grouping; hard-delete paid/denied history after 30 days (monthly).

create or replace function public.purge_old_payment_history(
  p_keep_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  keep_days integer;
  cutoff timestamptz;
  ids uuid[];
  n integer := 0;
begin
  me := public.current_profile();

  keep_days := coalesce(p_keep_days, 30);
  if keep_days < 1 then
    keep_days := 1;
  elsif keep_days > 90 then
    keep_days := 90;
  end if;

  cutoff := now() - make_interval(days => keep_days);

  select coalesce(array_agg(id), '{}')
  into ids
  from public.payments
  where status in ('paid', 'denied')
    and (
      deleted_at is not null
      or coalesce(paid_at, denied_at, updated_at) < cutoff
    );

  n := coalesce(cardinality(ids), 0);
  if n = 0 then
    return 0;
  end if;

  perform set_config('app.allow_history_purge', 'on', true);

  delete from public.payment_events
  where payment_id = any (ids);

  delete from public.payments
  where id = any (ids);

  return n;
end;
$$;

revoke all on function public.purge_old_payment_history(integer)
  from public, anon;
grant execute on function public.purge_old_payment_history(integer)
  to authenticated;
