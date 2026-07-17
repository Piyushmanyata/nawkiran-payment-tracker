-- Nawkiran Payment Tracker — schema
-- Run in Supabase SQL editor (in order: 001 → 002 → 003)

create extension if not exists "pgcrypto";

create type public.payment_status as enum (
  'pending',
  'approved',
  'denied',
  'paid'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  role text not null check (
    role in ('employee', 'director', 'accounts', 'admin')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  party text not null
    check (char_length(trim(party)) between 1 and 150),

  amount numeric(14,2) not null
    check (amount > 0),

  due_date date,
  purpose text
    check (purpose is null or char_length(purpose) <= 500),

  status public.payment_status not null default 'pending',

  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),

  approved_by uuid references public.profiles(id),
  approved_at timestamptz,

  denied_by uuid references public.profiles(id),
  denied_at timestamptz,
  denial_reason text
    check (denial_reason is null or char_length(denial_reason) <= 500),

  paid_by uuid references public.profiles(id),
  paid_at timestamptz,
  payment_mode text
    check (
      payment_mode is null
      or payment_mode in ('NEFT', 'RTGS', 'IMPS', 'UPI', 'Cheque', 'Cash', 'Other')
    ),
  payment_reference text
    check (payment_reference is null or char_length(payment_reference) <= 100),

  updated_at timestamptz not null default now(),
  version integer not null default 1,

  client_request_id uuid not null unique
);

create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  action text not null check (
    action in ('created', 'approved', 'denied', 'paid')
  ),
  performed_by uuid not null references public.profiles(id),
  old_status public.payment_status,
  new_status public.payment_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index payments_status_idx
  on public.payments(status);

create index payments_due_date_idx
  on public.payments(due_date)
  where due_date is not null;

create index payments_requested_by_idx
  on public.payments(requested_by);

create index payments_requested_at_idx
  on public.payments(requested_at desc);

create index payment_events_payment_id_idx
  on public.payment_events(payment_id);

-- Auto-create profile stub is intentional NO-OP: admin creates profiles in dashboard.
-- Optional: keep auth.users without auto-profile so inactive/missing profiles block RPCs.

alter publication supabase_realtime
  add table public.payments;
-- Nawkiran Payment Tracker — security definer RPCs
-- All status changes go through these functions only.

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
-- Nawkiran Payment Tracker — Row Level Security

alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Helper: role of current user (security definer, avoids recursive RLS)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  )
$$;

grant execute on function public.my_role() to authenticated;
grant execute on function public.is_active_user() to authenticated;

-- Profiles: read own; directors/accounts/admin read all (for display names).
-- Writes in v1 are via Supabase dashboard / service role only (no client policies).
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      id = auth.uid()
      or public.my_role() in ('director', 'accounts', 'admin')
    )
  );

-- Payments SELECT
create policy payments_select
  on public.payments
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('director', 'admin')
      or (public.my_role() = 'accounts' and status in ('approved', 'paid'))
      or (public.my_role() = 'employee' and requested_by = auth.uid())
      -- staff who may also request: directors/accounts already covered
      or requested_by = auth.uid()
    )
  );

-- No direct insert/update/delete — only security definer RPCs
create policy payments_no_direct_insert
  on public.payments
  for insert
  to authenticated
  with check (false);

create policy payments_no_direct_update
  on public.payments
  for update
  to authenticated
  using (false);

create policy payments_no_direct_delete
  on public.payments
  for delete
  to authenticated
  using (false);

-- Payment events SELECT
create policy payment_events_select
  on public.payment_events
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('director', 'accounts', 'admin')
      or exists (
        select 1 from public.payments p
        where p.id = payment_id and p.requested_by = auth.uid()
      )
    )
  );

create policy payment_events_no_direct_insert
  on public.payment_events
  for insert
  to authenticated
  with check (false);

create policy payment_events_no_direct_update
  on public.payment_events
  for update
  to authenticated
  using (false);

create policy payment_events_no_direct_delete
  on public.payment_events
  for delete
  to authenticated
  using (false);
