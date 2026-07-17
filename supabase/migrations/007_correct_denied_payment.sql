-- Employees can edit a denied payment and resubmit it for approval.

-- Allow "resubmitted" in payment_events.action
alter table public.payment_events
  drop constraint if exists payment_events_action_check;

alter table public.payment_events
  add constraint payment_events_action_check
  check (action in ('created', 'approved', 'denied', 'paid', 'resubmitted'));

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
declare
  me public.profiles;
  row public.payments;
  old public.payment_status;
  party_clean text;
  purpose_clean text;
  prior_reason text;
begin
  me := public.current_profile();

  select * into row
  from public.payments
  where id = p_payment_id
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status <> 'denied' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  -- Requesters may correct their own payment; admins may recover any record.
  if row.requested_by <> me.id and me.role <> 'admin' then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  party_clean := trim(p_party);
  if party_clean is null or char_length(party_clean) < 1 or char_length(party_clean) > 150 then
    raise exception 'INVALID_PARTY' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  purpose_clean := nullif(trim(coalesce(p_purpose, '')), '');
  if purpose_clean is not null and char_length(purpose_clean) > 500 then
    raise exception 'INVALID_PURPOSE' using errcode = 'P0001';
  end if;

  old := row.status;
  prior_reason := row.denial_reason;

  update public.payments
  set
    party = party_clean,
    amount = round(p_amount, 2),
    due_date = p_due_date,
    purpose = purpose_clean,
    status = 'pending',
    denied_by = null,
    denied_at = null,
    denial_reason = null,
    approved_by = null,
    approved_at = null,
    updated_at = now(),
    version = version + 1
  where id = p_payment_id
  returning * into row;

  insert into public.payment_events (
    payment_id,
    action,
    performed_by,
    old_status,
    new_status,
    note
  ) values (
    row.id,
    'resubmitted',
    me.id,
    old,
    'pending',
    case
      when prior_reason is null then 'Corrected and resubmitted'
      else 'Corrected and resubmitted (was denied: ' || left(prior_reason, 200) || ')'
    end
  );

  return row;
end;
$$;

revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text) from public;
revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text) from anon;
grant execute on function public.correct_denied_payment(uuid, text, numeric, date, text)
  to authenticated;
