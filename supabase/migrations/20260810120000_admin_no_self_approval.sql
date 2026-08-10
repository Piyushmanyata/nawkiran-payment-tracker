-- Admin loses auto-approve on create, and may not approve their own request.
-- Director is unchanged: their creates still land approved.
-- Admin may still DENY their own request — deny stops money, it does not
-- authorise it, and deny → withdraw is the only way an Admin retires a pending
-- row of their own (delete is barred from pending, withdraw needs denied).
-- No backfill: rows auto-approved under the old rule stay as they are (ADR-0013).

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
  auto_approve boolean;
  new_status public.payment_status;
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

  -- Director only. An Admin's own request now waits for a Director.
  auto_approve := me.role = 'director';
  new_status := case when auto_approve then 'approved'::public.payment_status
                     else 'pending'::public.payment_status end;

  begin
    insert into public.payments (
      party,
      amount,
      due_date,
      purpose,
      status,
      requested_by,
      client_request_id,
      approved_by,
      approved_at
    ) values (
      party_clean,
      round(p_amount, 2),
      p_due_date,
      purpose_clean,
      new_status,
      me.id,
      p_client_request_id,
      case when auto_approve then me.id else null end,
      case when auto_approve then now() else null end
    )
    returning * into row;
  exception
    when unique_violation then
      raise exception 'DUPLICATE_REQUEST' using errcode = 'P0001';
  end;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id, 'created', me.id, null, new_status,
    case when auto_approve then 'Auto-approved on create' else null end
  );

  if auto_approve then
    insert into public.payment_events (
      payment_id, action, performed_by, old_status, new_status, note
    ) values (
      row.id, 'approved', me.id, 'pending', 'approved', 'Auto-approved on create'
    );
  end if;

  return row;
end;
$$;

grant execute on function public.create_payment(text, numeric, uuid, date, text) to authenticated;

-- Four-eyes: nobody approves the request they raised themselves.
-- Only reachable by an Admin — a Director's creates never sit in pending.
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

  if row.requested_by = me.id then
    raise exception 'SELF_APPROVAL' using errcode = 'P0001';
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

revoke all on function public.approve_payment(uuid) from public, anon;
grant execute on function public.approve_payment(uuid) to authenticated;

comment on function public.approve_payment(uuid) is
  'Approve a pending Payment Request. Raises SELF_APPROVAL if the caller is the requester (ADR-0013).';
