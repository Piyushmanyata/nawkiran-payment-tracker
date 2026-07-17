-- Harden current policies for Supabase's RLS planner guidance and index
-- foreign-key columns used by audit and payment lifecycle operations.

create index if not exists payment_events_performed_by_idx
  on public.payment_events(performed_by);

create index if not exists payments_approved_by_idx
  on public.payments(approved_by)
  where approved_by is not null;

create index if not exists payments_denied_by_idx
  on public.payments(denied_by)
  where denied_by is not null;

create index if not exists payments_paid_by_idx
  on public.payments(paid_by)
  where paid_by is not null;

create index if not exists payments_deleted_at_idx
  on public.payments(deleted_at)
  where deleted_at is null;

-- Keep authorization predicates stable per statement instead of re-evaluating
-- auth functions once per row.
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    (select public.is_active_user())
    and (
      id = (select auth.uid())
      or (select public.is_active_user())
    )
  );

drop policy if exists payments_select on public.payments;
create policy payments_select
  on public.payments
  for select
  to authenticated
  using ((select public.is_active_user()) and deleted_at is null);

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select
  on public.payment_events
  for select
  to authenticated
  using ((select public.is_active_user()));

-- my_role is no longer needed by the canonical policies and should not remain
-- callable as an exposed RPC.
revoke all on function public.my_role() from public;
revoke all on function public.my_role() from anon;
revoke all on function public.my_role() from authenticated;
