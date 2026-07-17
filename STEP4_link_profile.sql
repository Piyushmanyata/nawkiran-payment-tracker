-- ============================================================
-- STEP 4 — Link Auth user to profiles (run in SQL Editor)
-- ============================================================

-- 1) Confirm this UUID exists in Auth
select id, email, email_confirmed_at, created_at
from auth.users
where id = 'fd81a844-70cd-4be2-afb5-b66b8c3112d4';

-- 2) Insert / update profile
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

-- 3) Fix profiles RLS so users can always read their OWN row
--    (avoids "empty profile" after login)
drop policy if exists profiles_select_own_or_staff on public.profiles;

create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.my_role() in ('director', 'accounts', 'admin')
  );

-- 4) Prove it worked (must return 1 row)
select id, full_name, role, active from public.profiles;
