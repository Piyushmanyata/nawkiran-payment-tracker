-- Reconciled from the applied database state on 2026-09-08. This migration was
-- applied directly to the project and never had a file here, so rebuilding from
-- `supabase/migrations/` did not reproduce production. The body below is verbatim
-- as applied (version 20260811175621), which is already recorded in
-- `supabase_migrations.schema_migrations` — it will not re-run against this
-- project, only against a fresh rebuild.

-- 1. Stale RPC overloads left behind by later migrations.
drop function if exists public.update_todo(uuid, text, date, public.todo_priority, uuid[]);
drop function if exists public.create_todo(text, date, public.todo_priority, uuid[]);
drop function if exists public.list_todo_update_request_push_targets(uuid);
drop function if exists public.list_todo_update_reply_push_targets(uuid, uuid[]);

-- 2. Migration 008 locked every RPC to `authenticated`; later migrations added
--    signatures and never repeated the revoke.
revoke all on function public.create_todo(text, date, public.todo_priority, uuid[], jsonb) from public, anon;
grant execute on function public.create_todo(text, date, public.todo_priority, uuid[], jsonb) to authenticated;

revoke all on function public.is_todo_overdue_ist(public.todos) from public, anon;
grant execute on function public.is_todo_overdue_ist(public.todos) to authenticated;

-- 3. auth_rls_initplan: one InitPlan per query instead of per row.
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (
    (select public.is_active_user())
    and (select public.my_role()) <> 'supervisor'
    and (
      (select public.my_role()) in ('director', 'admin')
      or status in ('approved', 'paid')
      or requested_by = (select auth.uid())
    )
  );

drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select on public.payment_events
  for select to authenticated
  using (
    (select public.is_active_user())
    and (select public.my_role()) <> 'supervisor'
    and (
      (select public.my_role()) in ('director', 'admin')
      or exists (
        select 1
        from public.payments p
        where p.id = payment_events.payment_id
          and (p.status in ('approved', 'paid') or p.requested_by = (select auth.uid()))
      )
    )
  );

drop policy if exists workers_select on public.workers;
create policy workers_select on public.workers
  for select to authenticated
  using (
    (select public.is_active_user())
    and (
      (select public.my_role()) in ('employee', 'director', 'accounts', 'admin')
      or (
        (select public.my_role()) = 'supervisor'
        and company = (select p.company from public.profiles p where p.id = (select auth.uid()))
      )
    )
  );

drop policy if exists attendance_days_select on public.attendance_days;
create policy attendance_days_select on public.attendance_days
  for select to authenticated
  using (
    (select public.is_active_user())
    and (
      (select public.my_role()) in ('employee', 'director', 'accounts', 'admin')
      or (
        (select public.my_role()) = 'supervisor'
        and company = (select p.company from public.profiles p where p.id = (select auth.uid()))
      )
    )
  );

drop policy if exists attendance_entries_select on public.attendance_entries;
create policy attendance_entries_select on public.attendance_entries
  for select to authenticated
  using (
    (select public.is_active_user())
    and (
      (select public.my_role()) in ('employee', 'director', 'accounts', 'admin')
      or (
        (select public.my_role()) = 'supervisor'
        and exists (
          select 1
          from public.attendance_days d
          where d.id = attendance_entries.attendance_day_id
            and d.company = (select p.company from public.profiles p where p.id = (select auth.uid()))
        )
      )
    )
  );

drop policy if exists attendance_events_select on public.attendance_events;
create policy attendance_events_select on public.attendance_events
  for select to authenticated
  using (
    (select public.is_active_user())
    and (
      (select public.my_role()) in ('employee', 'director', 'accounts', 'admin')
      or (
        (select public.my_role()) = 'supervisor'
        and exists (
          select 1
          from public.attendance_days d
          where d.id = attendance_events.attendance_day_id
            and d.company = (select p.company from public.profiles p where p.id = (select auth.uid()))
        )
      )
    )
  );

-- 4. Foreign keys without a covering index.
create index if not exists attendance_days_confirmed_by_idx on public.attendance_days (confirmed_by);
create index if not exists attendance_entries_recorded_by_idx on public.attendance_entries (recorded_by);
create index if not exists attendance_events_performed_by_idx on public.attendance_events (performed_by);
create index if not exists todos_created_by_idx on public.todos (created_by);
create index if not exists todos_completed_by_idx on public.todos (completed_by);
create index if not exists workers_created_by_idx on public.workers (created_by);
