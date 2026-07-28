-- Denied Payment Requests are no longer history: they stay OPEN for the
-- requester until the money actually moves (paid) or the requester gives up
-- on the request (withdrawn).
--
-- 1. withdraw_payment() — the requester's only way to retire a denied request.
-- 2. edit_unpaid_payment() — withdrawn is terminal, so it cannot be edited.
-- 3. admin_delete_payment() — admins may still remove withdrawn rows.
-- 4. purge_old_payment_history() — never hard-delete a live denied request.

-- 1. Requester withdraws their own denied request ---------------------------
create or replace function public.withdraw_payment(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
begin
  me := public.current_profile();

  select * into row
  from public.payments
  where id = p_payment_id
    and deleted_at is null
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Only the person who raised it decides to drop it, and only once denied.
  if row.requested_by is distinct from me.id then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  if row.status <> 'denied' then
    raise exception 'NOT_DENIED' using errcode = 'P0001';
  end if;

  update public.payments
  set
    status = 'withdrawn',
    updated_at = now(),
    version = version + 1
  where id = p_payment_id
  returning * into row;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id, 'withdrawn', me.id, 'denied', 'withdrawn',
    'Withdrawn by requester after denial'
  );

  return row;
end;
$$;

revoke all on function public.withdraw_payment(uuid) from public, anon;
grant execute on function public.withdraw_payment(uuid) to authenticated;

-- 2. Withdrawn is terminal — same as paid for edit purposes -----------------
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

  if row.status in ('paid', 'withdrawn') then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  -- Own pending/denied only; never approved (or peers).
  if me.role in ('employee', 'accounts') then
    if row.requested_by is distinct from me.id then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
    if row.status = 'approved' then
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

-- 3. Admin cleanup covers withdrawn rows too --------------------------------
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

  if row.status not in ('paid', 'denied', 'withdrawn') then
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

revoke all on function public.admin_delete_payment(uuid) from public, anon;
grant execute on function public.admin_delete_payment(uuid) to authenticated;

-- 4. Retention: a denied request is live work, so it is never auto-purged ---
create or replace function public.purge_old_payment_history(
  p_keep_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_days integer;
  cutoff timestamptz;
  ids uuid[];
  n integer := 0;
begin
  perform public.current_profile();

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
  where
    -- Admin already removed it from history: drop it on the next sweep.
    (deleted_at is not null and status in ('paid', 'denied', 'withdrawn'))
    -- Otherwise only settled rows age out. Denied rows stay: they are still
    -- open work for their requester until paid or withdrawn.
    or (
      status in ('paid', 'withdrawn')
      and coalesce(paid_at, updated_at) < cutoff
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
