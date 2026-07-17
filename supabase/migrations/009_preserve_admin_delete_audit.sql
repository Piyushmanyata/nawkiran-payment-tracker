-- Hide admin-deleted history without destroying the permanent audit trail.

alter table public.payments
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id);

create or replace function public.prevent_deleted_payment_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AUDIT_RECORD_IMMUTABLE' using errcode = 'P0001';
  elsif old.deleted_at is not null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_deleted_payment_changes() from public;
revoke all on function public.prevent_deleted_payment_changes() from anon;
revoke all on function public.prevent_deleted_payment_changes() from authenticated;

drop trigger if exists prevent_deleted_payment_changes on public.payments;
create trigger prevent_deleted_payment_changes
  before update or delete on public.payments
  for each row execute function public.prevent_deleted_payment_changes();

alter table public.payment_events
  drop constraint if exists payment_events_action_check;

alter table public.payment_events
  add constraint payment_events_action_check
  check (action in (
    'created', 'approved', 'denied', 'paid', 'resubmitted', 'admin_deleted'
  ));

create or replace function public.admin_delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
begin
  me := public.current_profile();

  if me.role <> 'admin' then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id and deleted_at is null
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status not in ('paid', 'denied') then
    raise exception 'NOT_HISTORY' using errcode = 'P0001';
  end if;

  update public.payments
  set deleted_at = now(), deleted_by = me.id, updated_at = now()
  where id = p_payment_id;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id, 'admin_deleted', me.id, row.status, row.status,
    'Removed from active history by admin'
  );
end;
$$;

revoke all on function public.admin_delete_payment(uuid) from public;
revoke all on function public.admin_delete_payment(uuid) from anon;
grant execute on function public.admin_delete_payment(uuid) to authenticated;

drop policy if exists payments_select on public.payments;
create policy payments_select
  on public.payments
  for select
  to authenticated
  using (public.is_active_user() and deleted_at is null);
