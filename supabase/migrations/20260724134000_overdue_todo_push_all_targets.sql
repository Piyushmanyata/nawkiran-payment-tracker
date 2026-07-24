-- Migration: Overdue todo push targets across all responsible users
-- Fixes: overdue nudge was only sent to self; spec requires push to all assignees
-- (or initiator if unassigned) across the whole team.

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
  -- Collect overdue to-dos per responsible user (assignee or initiator-if-none).
  -- Respects the same 12pm IST rule for recurring items as list_my_overdue_todo_titles.
  return query
  with responsible_users as (
    -- Assignees of overdue todos
    select
      ta.profile_id          as user_id,
      t.title                as title
    from public.todos t
    join public.todo_assignees ta on ta.todo_id = t.id
    where t.status = 'open'
      and t.due_date is not null
      and (
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
        or (
          (t.recurrence_rule is null or t.recurrence_rule->>'type' is null or t.recurrence_rule->>'type' = 'none')
          and t.due_date < (timezone('Asia/Kolkata', now()))::date
        )
      )

    union all

    -- Initiator of overdue todos that have NO assignees
    select
      t.created_by           as user_id,
      t.title                as title
    from public.todos t
    where t.status = 'open'
      and t.due_date is not null
      and not exists (
        select 1 from public.todo_assignees ta2 where ta2.todo_id = t.id
      )
      and (
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
        or (
          (t.recurrence_rule is null or t.recurrence_rule->>'type' is null or t.recurrence_rule->>'type' = 'none')
          and t.due_date < (timezone('Asia/Kolkata', now()))::date
        )
      )
  )
  select
    ru.user_id,
    array_agg(ru.title order by ru.title) as titles
  from responsible_users ru
  -- Only active profiles with push subscriptions
  join public.profiles p on p.id = ru.user_id and p.active = true
  where exists (
    select 1 from public.push_subscriptions ps where ps.user_id = ru.user_id
  )
  group by ru.user_id;
end;
$$;

revoke all on function public.list_overdue_todo_push_targets() from public, anon;
grant execute on function public.list_overdue_todo_push_targets() to authenticated;
