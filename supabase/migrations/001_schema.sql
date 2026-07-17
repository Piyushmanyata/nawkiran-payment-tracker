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
