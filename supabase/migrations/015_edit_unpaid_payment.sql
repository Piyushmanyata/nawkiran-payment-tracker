-- Directors and employees can edit unpaid payments (pending/approved/denied).
-- Denied payments are cleared and resubmitted as pending.

alter table public.payment_events
  drop constraint if exists payment_events_action_check;

alter table public.payment_events
  add constraint payment_events_action_check
  check (action in (
    'created',
    'approved',
    'denied',
    'paid',
    'resubmitted',
    'edited',
    'admin_deleted'
  ));

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

-- Keep old RPC as a thin wrapper for denied resubmits (no purpose).
create or replace function public.correct_denied_payment(
  p_payment_id uuid,
  p_party text,
  p_amount numeric,
  p_due_date date default null,
  p_purpose text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
begin
  -- p_purpose ignored (notes removed)
  return public.edit_unpaid_payment(p_payment_id, p_party, p_amount, p_due_date);
end;
$$;

revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text)
  from public, anon;
grant execute on function public.correct_denied_payment(uuid, text, numeric, date, text)
  to authenticated;
