-- Supervisors are attendance-only, including profile reads.

grant execute on function public.my_role() to authenticated;

drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    (select public.is_active_user())
    and (
      id = (select auth.uid())
      or (
        (select public.my_role()) <> 'supervisor'
        and active = true
      )
    )
  );
