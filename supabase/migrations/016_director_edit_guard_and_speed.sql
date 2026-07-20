-- Security: employees/accounts may not edit director-requested payments.
-- Performance: composite index for status-sorted active lists.

create index if not exists payments_active_status_requested_at_idx
  on public.payments (status, requested_at desc)
  where deleted_at is null;

create index if not exists profiles_role_active_idx
  on public.profiles (role)
  where active = true;

create or replace function public.edit_unpaid_payment(
  p_payment_id uuid,
  p_party text,
  p_amount numeric,
  p_due_date date default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
  old public.payment_status;
  party_clean text;
  new_status public.payment_status;
  event_action text;
  event_note text;
  prior_reason text;
  requester_role text;
begin
  me := public.current_profile();

  if me.role not in ('employee', 'director', 'accounts', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id
    and deleted_at is null
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status = 'paid' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  -- Only director/admin may edit payments requested by a director.
  -- Employees may edit each others' (and accounts') unpaid rows.
  if me.role in ('employee', 'accounts') then
    select pr.role into requester_role
    from public.profiles pr
    where pr.id = row.requested_by;

    if requester_role = 'director' then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
  end if;

  party_clean := trim(p_party);
  if party_clean is null or char_length(party_clean) < 1 or char_length(party_clean) > 150 then
    raise exception 'INVALID_PARTY' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  old := row.status;
  prior_reason := row.denial_reason;

  if old = 'denied' then
    new_status := 'pending';
    event_action := 'resubmitted';
    event_note := case
      when prior_reason is null then 'Corrected and resubmitted'
      else 'Corrected and resubmitted (was denied: ' || left(prior_reason, 200) || ')'
    end;

    update public.payments
    set
      party = party_clean,
      amount = round(p_amount, 2),
      due_date = p_due_date,
      status = new_status,
      denied_by = null,
      denied_at = null,
      denial_reason = null,
      approved_by = null,
      approved_at = null,
      updated_at = now(),
      version = version + 1
    where id = p_payment_id
    returning * into row;
  else
    new_status := old;
    event_action := 'edited';
    event_note := 'Edited before paid';

    update public.payments
    set
      party = party_clean,
      amount = round(p_amount, 2),
      due_date = p_due_date,
      updated_at = now(),
      version = version + 1
    where id = p_payment_id
    returning * into row;
  end if;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id,
    event_action,
    me.id,
    old,
    new_status,
    event_note
  );

  return row;
end;
$$;

revoke all on function public.edit_unpaid_payment(uuid, text, numeric, date)
  from public, anon;
grant execute on function public.edit_unpaid_payment(uuid, text, numeric, date)
  to authenticated;
