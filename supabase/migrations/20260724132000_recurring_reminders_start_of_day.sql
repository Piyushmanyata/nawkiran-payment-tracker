-- Migration: Recurring Reminders Start of Day
-- Recurring reminders show up starting at the start of the scheduled due date (due_date <= current_date).

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
  where t.status = 'open'
    and t.due_date is not null
    and (
      (
        t.recurrence_rule is not null
        and t.recurrence_rule->>'type' is not null
        and t.recurrence_rule->>'type' <> 'none'
        and t.due_date <= (timezone('Asia/Kolkata', now()))::date
      )
      or (
        (t.recurrence_rule is null or t.recurrence_rule->>'type' is null or t.recurrence_rule->>'type' = 'none')
        and t.due_date < (timezone('Asia/Kolkata', now()))::date
      )
    )
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
