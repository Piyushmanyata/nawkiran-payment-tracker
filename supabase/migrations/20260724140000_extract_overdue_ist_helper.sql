-- Extract repeated 12pm-IST overdue predicate into a helper function.
-- The same 8-line JSONB + timezone condition was duplicated verbatim in:
--   20260724132000 (list_my_overdue_todo_titles) and
--   20260724134000 (list_overdue_todo_push_targets, twice: assignee + initiator branch).
-- This migration replaces all three with a single call.

create or replace function public.is_todo_overdue_ist(t public.todos)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.status = 'open'
    and t.due_date is not null
    and (
      -- Recurring: overdue since due_date, or from 12pm IST on due date itself.
      (
        t.recurrence_rule is not null
        and t.recurrence_rule->>'type' is not null
        and t.recurrence_rule->>'type' <> 'none'
        and (
          t.due_date < (timezone('Asia/Kolkata', now()))::date
          or (
            t.due_date = (timezone('Asia/Kolkata', now()))::date
            and extract(hour from timezone('Asia/Kolkata', now())) >= 12
          )
        )
      )
      -- Non-recurring: strictly before today.
      or (
        (t.recurrence_rule is null
          or t.recurrence_rule->>'type' is null
          or t.recurrence_rule->>'type' = 'none')
        and t.due_date < (timezone('Asia/Kolkata', now()))::date
      )
    );
$$;

-- No grant needed — security invoker; called only from security-definer RPCs.

-- Rewrite list_my_overdue_todo_titles using the helper.
create or replace function public.list_my_overdue_todo_titles()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me public.profiles;
  titles text[];
begin
  me := public.current_profile();

  select coalesce(array_agg(t.title order by t.due_date, t.created_at desc), '{}')
  into titles
  from public.todos t
  where public.is_todo_overdue_ist(t)
    and (
      exists (
        select 1 from public.todo_assignees ta
        where ta.todo_id = t.id and ta.profile_id = me.id
      )
      or (
        t.created_by = me.id
        and not exists (
          select 1 from public.todo_assignees ta2 where ta2.todo_id = t.id
        )
      )
    );

  return titles;
end;
$$;

revoke all on function public.list_my_overdue_todo_titles() from public, anon;
grant execute on function public.list_my_overdue_todo_titles() to authenticated;

-- Rewrite list_overdue_todo_push_targets using the helper.
create or replace function public.list_overdue_todo_push_targets()
returns table (
  user_id   uuid,
  titles    text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with responsible_users as (
    -- Assignees of overdue todos
    select ta.profile_id as user_id, t.title
    from public.todos t
    join public.todo_assignees ta on ta.todo_id = t.id
    where public.is_todo_overdue_ist(t)

    union all

    -- Initiator of overdue todos that have NO assignees
    select t.created_by as user_id, t.title
    from public.todos t
    where public.is_todo_overdue_ist(t)
      and not exists (
        select 1 from public.todo_assignees ta2 where ta2.todo_id = t.id
      )
  )
  select
    ru.user_id,
    array_agg(ru.title order by ru.title) as titles
  from responsible_users ru
  join public.profiles p on p.id = ru.user_id and p.active = true
  where exists (
    select 1 from public.push_subscriptions ps where ps.user_id = ru.user_id
  )
  group by ru.user_id;
end;
$$;

revoke all on function public.list_overdue_todo_push_targets() from public, anon;
grant execute on function public.list_overdue_todo_push_targets() to authenticated;
