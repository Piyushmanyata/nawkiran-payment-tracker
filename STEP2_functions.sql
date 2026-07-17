-- ============================================================
-- STEP 2 of 3 — DATABASE FUNCTIONS (run AFTER Step 1 succeeds)
-- ============================================================

create or replace function public.current_profile()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  select * into p
  from public.profiles
  where id = auth.uid();

  if p.id is null then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  if not p.active then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  return p;
end;
$$;

create or replace function public.create_payment(
  p_party text,
  p_amount numeric,
  p_client_request_id uuid,
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
  party_clean text;
  purpose_clean text;
  row public.payments;
begin
  me := public.current_profile();

  if me.role not in ('employee', 'director', 'accounts', 'admin') then
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

  begin
    insert into public.payments (
      party,
      amount,
      due_date,
      purpose,
      status,
      requested_by,
      client_request_id
    ) values (
      party_clean,
      round(p_amount, 2),
      p_due_date,
      purpose_clean,
      'pending',
      me.id,
      p_client_request_id
    )
    returning * into row;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_REQUEST' using errcode = 'P0001';
  end;

  insert into public.payment_events (
    payment_id,
    action,
    performed_by,
    old_status,
    new_status,
    note
  ) values (
    row.id,
    'created',
    me.id,
    null,
    'pending',
    null
  );

  return row;
end;
$$;

create or replace function public.approve_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
  old public.payment_status;
begin
  me := public.current_profile();

  if me.role not in ('director', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status <> 'pending' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  old := row.status;

  update public.payments
  set
    status = 'approved',
    approved_by = me.id,
    approved_at = now(),
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
    'approved',
    me.id,
    old,
    'approved',
    null
  );

  return row;
end;
$$;

create or replace function public.deny_payment(
  p_payment_id uuid,
  p_reason text
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
  reason_clean text;
begin
  me := public.current_profile();

  if me.role not in ('director', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  reason_clean := trim(coalesce(p_reason, ''));
  if reason_clean = '' or char_length(reason_clean) > 500 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status <> 'pending' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  old := row.status;

  update public.payments
  set
    status = 'denied',
    denied_by = me.id,
    denied_at = now(),
    denial_reason = reason_clean,
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
    'denied',
    me.id,
    old,
    'denied',
    reason_clean
  );

  return row;
end;
$$;

create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_payment_mode text,
  p_payment_reference text default null
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
  mode_clean text;
  ref_clean text;
begin
  me := public.current_profile();

  if me.role not in ('accounts', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  mode_clean := trim(coalesce(p_payment_mode, ''));
  if mode_clean not in ('NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Other') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = 'P0001';
  end if;

  ref_clean := nullif(trim(coalesce(p_payment_reference, '')), '');
  if ref_clean is not null and char_length(ref_clean) > 100 then
    raise exception 'INVALID_REFERENCE' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status <> 'approved' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  old := row.status;

  update public.payments
  set
    status = 'paid',
    paid_by = me.id,
    paid_at = now(),
    payment_mode = mode_clean,
    payment_reference = ref_clean,
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
    'paid',
    me.id,
    old,
    'paid',
    coalesce(mode_clean || case when ref_clean is null then '' else ' · ' || ref_clean end, mode_clean)
  );

  return row;
end;
$$;

grant execute on function public.current_profile() to authenticated;
grant execute on function public.create_payment(text, numeric, uuid, date, text) to authenticated;
grant execute on function public.approve_payment(uuid) to authenticated;
grant execute on function public.deny_payment(uuid, text) to authenticated;
grant execute on function public.mark_payment_paid(uuid, text, text) to authenticated;
