-- Supervisor role + Company dimension (ADR-0006).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('employee', 'director', 'accounts', 'admin', 'supervisor'));

alter table public.profiles
  add column if not exists company text;

alter table public.profiles drop constraint if exists profiles_company_check;
alter table public.profiles add constraint profiles_company_check
  check (company is null or company in ('NKPL', 'APTUS'));

-- A Supervisor without a Company can see nothing and is a bug, not a state.
alter table public.profiles drop constraint if exists profiles_supervisor_company_check;
alter table public.profiles add constraint profiles_supervisor_company_check
  check (role <> 'supervisor' or company is not null);
