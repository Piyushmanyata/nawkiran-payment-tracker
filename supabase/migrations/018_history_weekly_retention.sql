-- Weekly history retention: soft-delete paid/denied rows older than N days
-- (default 7). Open payments (pending/approved) are never purged.
-- Audit events remain; UI only shows non-deleted rows.

create index if not exists payments_paid_at_history_idx
  on public.payments (paid_at desc)
  where deleted_at is null and status = 'paid';

create index if not exists payments_denied_at_history_idx
  on public.payments (denied_at desc)
  where deleted_at is null and status = 'denied';

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
  n integer := 0;
  r record;
begin
  me := public.current_profile();

  keep_days := coalesce(p_keep_days, 7);
  if keep_days < 1 then
    keep_days := 1;
  elsif keep_days > 90 then
    keep_days := 90;
  end if;

  cutoff := now() - make_interval(days => keep_days);

  for r in
    select id, status
    from public.payments
    where deleted_at is null
      and status in ('paid', 'denied')
      and coalesce(paid_at, denied_at, updated_at) < cutoff
    order by coalesce(paid_at, denied_at, updated_at) asc
    for update skip locked
  loop
    update public.payments
    set
      deleted_at = now(),
      deleted_by = me.id,
      updated_at = now()
    where id = r.id
      and deleted_at is null;

    if found then
      insert into public.payment_events (
        payment_id, action, performed_by, old_status, new_status, note
      ) values (
        r.id,
        'admin_deleted',
        me.id,
        r.status,
        r.status,
        'Auto-removed: weekly history retention (' || keep_days || ' days)'
      );
      n := n + 1;
    end if;
  end loop;

  return n;
end;
$$;

revoke all on function public.purge_old_payment_history(integer)
  from public, anon;
grant execute on function public.purge_old_payment_history(integer)
  to authenticated;
