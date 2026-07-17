-- ============================================================
-- FIX: profile + security helpers (safe to re-run)
-- Run ALL of this in one go in Supabase SQL Editor.
-- ============================================================

-- ---------- A) Link your Auth user ----------
insert into public.profiles (id, full_name, role, active)
values (
  'fd81a844-70cd-4be2-afb5-b66b8c3112d4',
  'Piyush',
  'admin',
  true
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  active = excluded.active;

-- ---------- B) Role helpers (from Step 3) ----------
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

-- ---------- C) Enable RLS ----------
alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- ---------- D) Policies ----------
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.my_role() in ('director', 'accounts', 'admin')
  );

drop policy if exists payments_select on public.payments;
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
      or requested_by = auth.uid()
    )
  );

drop policy if exists payments_no_direct_insert on public.payments;
create policy payments_no_direct_insert
  on public.payments
  for insert
  to authenticated
  with check (false);

drop policy if exists payments_no_direct_update on public.payments;
create policy payments_no_direct_update
  on public.payments
  for update
  to authenticated
  using (false);

drop policy if exists payments_no_direct_delete on public.payments;
create policy payments_no_direct_delete
  on public.payments
  for delete
  to authenticated
  using (false);

drop policy if exists payment_events_select on public.payment_events;
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

drop policy if exists payment_events_no_direct_insert on public.payment_events;
create policy payment_events_no_direct_insert
  on public.payment_events
  for insert
  to authenticated
  with check (false);

drop policy if exists payment_events_no_direct_update on public.payment_events;
create policy payment_events_no_direct_update
  on public.payment_events
  for update
  to authenticated
  using (false);

drop policy if exists payment_events_no_direct_delete on public.payment_events;
create policy payment_events_no_direct_delete
  on public.payment_events
  for delete
  to authenticated
  using (false);

-- ---------- E) Proof (must show 1 profile row) ----------
select id, full_name, role, active from public.profiles;

select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
  and proname in (
    'my_role',
    'is_active_user',
    'create_payment',
    'approve_payment',
    'deny_payment',
    'mark_payment_paid'
  )
order by proname;
