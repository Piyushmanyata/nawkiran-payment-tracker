-- RUN IN SUPABASE SQL EDITOR (one shot)
-- 1) Director/admin creates → auto-approved
-- 2) Mark paid needs no NEFT/UTR (defaults)

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

  auto_approve := me.role in ('director', 'admin');
  new_status := case when auto_approve then 'approved'::public.payment_status
                     else 'pending'::public.payment_status end;

  begin
    insert into public.payments (
      party, amount, due_date, purpose, status, requested_by, client_request_id,
      approved_by, approved_at
    ) values (
      party_clean, round(p_amount, 2), p_due_date, purpose_clean, new_status, me.id, p_client_request_id,
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

create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_payment_mode text default null,
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

  if me.role not in ('employee', 'accounts', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  mode_clean := nullif(trim(coalesce(p_payment_mode, '')), '');
  if mode_clean is null then
    mode_clean := 'Other';
  elsif mode_clean not in ('NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Other') then
    raise exception 'INVALID_PAYMENT_MODE' using errcode = 'P0001';
  end if;

  ref_clean := nullif(trim(coalesce(p_payment_reference, '')), '');
  if ref_clean is not null and char_length(ref_clean) > 100 then
    raise exception 'INVALID_REFERENCE' using errcode = 'P0001';
  end if;

  select * into row from public.payments where id = p_payment_id for update;

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
    payment_id, action, performed_by, old_status, new_status, note
  ) values (row.id, 'paid', me.id, old, 'paid', null);

  return row;
end;
$$;

grant execute on function public.mark_payment_paid(uuid, text, text) to authenticated;
