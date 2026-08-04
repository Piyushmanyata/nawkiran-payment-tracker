-- Supervisors are attendance-only, including at the REST/RLS read boundary.

drop policy if exists payments_select on public.payments;
create policy payments_select
  on public.payments
  for select
  to authenticated
  using (
    public.is_active_user()
    and public.my_role() <> 'supervisor'
    and (
      public.my_role() in ('director', 'admin')
      or status in ('approved', 'paid')
      or requested_by = auth.uid()
    )
  );

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select
  on public.payment_events
  for select
  to authenticated
  using (
    public.is_active_user()
    and public.my_role() <> 'supervisor'
    and (
      public.my_role() in ('director', 'admin')
      or exists (
        select 1 from public.payments p
        where p.id = payment_id
          and (
            p.status in ('approved', 'paid')
            or p.requested_by = auth.uid()
          )
      )
    )
  );

drop policy if exists todos_select on public.todos;
create policy todos_select
  on public.todos
  for select
  to authenticated
  using (
    public.is_active_user()
    and public.my_role() <> 'supervisor'
  );

drop policy if exists todo_assignees_select on public.todo_assignees;
create policy todo_assignees_select
  on public.todo_assignees
  for select
  to authenticated
  using (
    public.is_active_user()
    and public.my_role() <> 'supervisor'
  );
