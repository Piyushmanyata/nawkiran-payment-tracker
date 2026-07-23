-- Harden todo assign push: targets only for current assignees of a todo.
-- Overdue nudge: titles the caller is responsible for (assignee, or initiator if none).

drop function if exists public.list_todo_push_targets(uuid[]);

create or replace function public.list_todo_push_targets(
  p_todo_id uuid,
  p_user_ids uuid[]
)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me public.profiles;
begin
  me := public.current_profile();

  if p_todo_id is null then
    return;
  end if;

  return query
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.user_id = any (coalesce(p_user_ids, '{}'))
    and ps.user_id <> me.id
    and exists (
      select 1
      from public.todo_assignees ta
      where ta.todo_id = p_todo_id
        and ta.profile_id = ps.user_id
    );
end;
$$;

revoke all on function public.list_todo_push_targets(uuid, uuid[]) from public, anon;
grant execute on function public.list_todo_push_targets(uuid, uuid[]) to authenticated;

-- Open overdue to-dos the current user should be nudged about.
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
    and t.due_date < (timezone('Asia/Kolkata', now()))::date
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
