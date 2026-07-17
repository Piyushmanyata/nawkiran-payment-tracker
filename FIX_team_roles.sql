-- ============================================================
-- RUN ONCE in Supabase SQL Editor (project ygeawyinrjknimjtsicx)
-- Confirms Anjali/Sweeti, links profiles, expands role access
-- ============================================================

-- A) Confirm emails for users created via API (no mailbox required)
-- Note: confirmed_at is a GENERATED column — only update email_confirmed_at
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where id in (
  '285d1e4d-994e-4d6d-a7f6-3340b257441e', -- Anjali
  '50dfa9c5-4528-49ef-acc2-88ed57b106dd'  -- Sweeti
);

-- B) Link Anjali + Sweeti (employees)
insert into public.profiles (id, full_name, role, active) values
  ('285d1e4d-994e-4d6d-a7f6-3340b257441e', 'Anjali', 'employee', true),
  ('50dfa9c5-4528-49ef-acc2-88ed57b106dd', 'Sweeti', 'employee', true)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active;

-- C) Nawneet: create in Auth dashboard first (Auto Confirm ON),
--    then paste UUID below and uncomment:
/*
insert into public.profiles (id, full_name, role, active)
values ('PASTE_NAWNEET_UUID', 'Nawneet', 'director', true)
on conflict (id) do update
set full_name = excluded.full_name,
    role = excluded.role,
    active = excluded.active;
*/

-- D) Role access: employees can mark paid + see full lists
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

  if me.role not in ('employee', 'accounts', 'admin') then
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
  ) values (
    row.id, 'paid', me.id, old, 'paid',
    coalesce(mode_clean || case when ref_clean is null then '' else ' · ' || ref_clean end, mode_clean)
  );

  return row;
end;
$$;

grant execute on function public.mark_payment_paid(uuid, text, text) to authenticated;

drop policy if exists payments_select on public.payments;
create policy payments_select
  on public.payments for select to authenticated
  using (public.is_active_user());

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select
  on public.payment_events for select to authenticated
  using (public.is_active_user());

drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());

-- E) Proof
select id, email, email_confirmed_at is not null as confirmed
from auth.users
where email in ('anjali@nawkiran.com', 'sweeti@nawkiran.com', 'nawneet@nawkiran.com');

select id, full_name, role, active from public.profiles order by full_name;
