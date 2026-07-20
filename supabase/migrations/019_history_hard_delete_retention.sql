-- Weekly history retention: HARD-delete paid/denied rows older than N days
-- (default 7) to reclaim database space. Open payments are never purged.
-- Also permanently removes previously soft-deleted history rows.

-- Allow security-definer purge (and only that) to hard-delete payments.
create or replace function public.prevent_deleted_payment_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Transaction-local flag set by purge_old_payment_history.
  if current_setting('app.allow_history_purge', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'AUDIT_RECORD_IMMUTABLE' using errcode = 'P0001';
  elsif old.deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.purge_old_payment_history(
  p_keep_days integer default 7
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

  keep_days := coalesce(p_keep_days, 7);
  if keep_days < 1 then
    keep_days := 1;
  elsif keep_days > 90 then
    keep_days := 90;
  end if;

  cutoff := now() - make_interval(days => keep_days);

  -- Age-out active history + reclaim any prior soft-deletes.
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

  -- Local to this transaction only.
  perform set_config('app.allow_history_purge', 'on', true);

  -- FK is ON DELETE RESTRICT — remove events first, then payments.
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
