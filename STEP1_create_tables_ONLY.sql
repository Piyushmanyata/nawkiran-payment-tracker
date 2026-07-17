-- ============================================================
-- STEP 1 of 3 — CREATE TABLES ONLY
-- Paste this ENTIRE file into Supabase SQL Editor, then Run.
-- Do NOT paste a file path. Do NOT run the profile insert yet.
-- ============================================================

create extension if not exists "pgcrypto";

do $$ begin
  create type public.payment_status as enum (
    'pending',
    'approved',
    'denied',
    'paid'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  role text not null check (
    role in ('employee', 'director', 'accounts', 'admin')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
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

create table if not exists public.payment_events (
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

create index if not exists payments_status_idx
  on public.payments(status);

create index if not exists payments_due_date_idx
  on public.payments(due_date)
  where due_date is not null;

create index if not exists payments_requested_by_idx
  on public.payments(requested_by);

create index if not exists payments_requested_at_idx
  on public.payments(requested_at desc);

create index if not exists payment_events_payment_id_idx
  on public.payment_events(payment_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payments'
  ) then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;

-- Verify tables were created (you should see 3 rows):
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('profiles', 'payments', 'payment_events')
order by table_name;
