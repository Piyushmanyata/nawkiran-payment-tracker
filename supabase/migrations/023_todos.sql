-- Team to-dos (grill: docs/domain-todos.md)
-- Shared board, multi-assignee, open forever / done 30-day purge.

create type public.todo_status as enum ('open', 'done');
create type public.todo_priority as enum ('normal', 'urgent');

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  title text not null
    check (char_length(trim(title)) between 1 and 200),
  priority public.todo_priority not null default 'normal',
  due_date date,
  status public.todo_status not null default 'open',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  constraint todos_completer_matches_status check (
    (status = 'open' and completed_by is null and completed_at is null)
    or (status = 'done' and completed_by is not null and completed_at is not null)
  )
);

create table public.todo_assignees (
  todo_id uuid not null references public.todos(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  primary key (todo_id, profile_id)
);

create index todos_status_created_at_idx
  on public.todos (status, created_at desc);

create index todos_open_due_date_idx
  on public.todos (due_date)
  where status = 'open' and due_date is not null;

create index todo_assignees_profile_id_idx
  on public.todo_assignees (profile_id);

-- Shared board: every active staff member can read names for assignees.
drop policy if exists profiles_select_own_or_staff on public.profiles;
create policy profiles_select_own_or_staff
  on public.profiles
  for select
  to authenticated
  using (
    public.is_active_user()
    and (id = auth.uid() or active = true)
  );

alter table public.todos enable row level security;
alter table public.todo_assignees enable row level security;

create policy todos_select
  on public.todos
  for select
  to authenticated
  using (public.is_active_user());

create policy todos_no_direct_insert
  on public.todos for insert to authenticated with check (false);

create policy todos_no_direct_update
  on public.todos for update to authenticated using (false);

create policy todos_no_direct_delete
  on public.todos for delete to authenticated using (false);

create policy todo_assignees_select
  on public.todo_assignees
  for select
  to authenticated
  using (public.is_active_user());

create policy todo_assignees_no_direct_insert
  on public.todo_assignees for insert to authenticated with check (false);

create policy todo_assignees_no_direct_update
  on public.todo_assignees for update to authenticated using (false);

create policy todo_assignees_no_direct_delete
  on public.todo_assignees for delete to authenticated using (false);

create or replace function public.todo_ui_row(p_todo public.todos)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_todo.id,
    'title', p_todo.title,
    'priority', p_todo.priority,
    'due_date', p_todo.due_date,
    'status', p_todo.status,
    'created_by', p_todo.created_by,
    'created_at', p_todo.created_at,
    'completed_by', p_todo.completed_by,
    'completed_at', p_todo.completed_at,
    'creator_name', (select full_name from public.profiles where id = p_todo.created_by),
    'completer_name', (select full_name from public.profiles where id = p_todo.completed_by),
    'assignees', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', p.id, 'full_name', p.full_name)
          order by p.full_name
        )
        from public.todo_assignees ta
        join public.profiles p on p.id = ta.profile_id
        where ta.todo_id = p_todo.id
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.replace_todo_assignees(
  p_todo_id uuid,
  p_assignee_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  clean uuid[];
  newly uuid[];
begin
  select coalesce(array_agg(distinct x), '{}')
  into clean
  from (
    select unnest(coalesce(p_assignee_ids, '{}')) as x
  ) s
  where exists (
    select 1 from public.profiles pr
    where pr.id = s.x and pr.active = true
  );

  select coalesce(array_agg(a), '{}')
  into newly
  from unnest(clean) a
  where not exists (
    select 1 from public.todo_assignees ta
    where ta.todo_id = p_todo_id and ta.profile_id = a
  );

  delete from public.todo_assignees where todo_id = p_todo_id;

  insert into public.todo_assignees (todo_id, profile_id)
  select p_todo_id, u from unnest(clean) u;

  return newly;
end;
$$;

create or replace function public.create_todo(
  p_title text,
  p_due_date date default null,
  p_priority public.todo_priority default 'normal',
  p_assignee_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  title_clean text;
  pri public.todo_priority;
  row public.todos;
  newly uuid[];
begin
  me := public.current_profile();

  title_clean := trim(coalesce(p_title, ''));
  if title_clean = '' or char_length(title_clean) > 200 then
    raise exception 'INVALID_TITLE' using errcode = 'P0001';
  end if;

  pri := coalesce(p_priority, 'normal');
  if pri not in ('normal', 'urgent') then
    raise exception 'INVALID_PRIORITY' using errcode = 'P0001';
  end if;

  insert into public.todos (title, priority, due_date, status, created_by)
  values (title_clean, pri, p_due_date, 'open', me.id)
  returning * into row;

  newly := public.replace_todo_assignees(row.id, p_assignee_ids);

  return public.todo_ui_row(row) || jsonb_build_object('newly_assigned', to_jsonb(newly));
end;
$$;

create or replace function public.update_todo(
  p_todo_id uuid,
  p_title text,
  p_due_date date default null,
  p_priority public.todo_priority default 'normal',
  p_assignee_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  title_clean text;
  pri public.todo_priority;
  row public.todos;
  newly uuid[];
begin
  me := public.current_profile();

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if row.status <> 'open' then
    raise exception 'TODO_FROZEN' using errcode = 'P0001';
  end if;

  if me.id <> row.created_by and me.role not in ('director', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  title_clean := trim(coalesce(p_title, ''));
  if title_clean = '' or char_length(title_clean) > 200 then
    raise exception 'INVALID_TITLE' using errcode = 'P0001';
  end if;

  pri := coalesce(p_priority, 'normal');
  if pri not in ('normal', 'urgent') then
    raise exception 'INVALID_PRIORITY' using errcode = 'P0001';
  end if;

  update public.todos
  set title = title_clean,
      due_date = p_due_date,
      priority = pri
  where id = p_todo_id
  returning * into row;

  newly := public.replace_todo_assignees(row.id, p_assignee_ids);

  return public.todo_ui_row(row) || jsonb_build_object('newly_assigned', to_jsonb(newly));
end;
$$;

create or replace function public.complete_todo(p_todo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.todos;
begin
  me := public.current_profile();

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if row.status = 'done' then
    raise exception 'ALREADY_DONE' using errcode = 'P0001';
  end if;

  update public.todos
  set status = 'done',
      completed_by = me.id,
      completed_at = now()
  where id = p_todo_id
  returning * into row;

  return public.todo_ui_row(row);
end;
$$;

create or replace function public.delete_todo(p_todo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.todos;
begin
  me := public.current_profile();
  if me.role <> 'admin' then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  delete from public.todos where id = p_todo_id;
end;
$$;

create or replace function public.purge_old_todos(p_keep_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  keep_days integer;
  cutoff timestamptz;
  n integer;
begin
  me := public.current_profile();

  keep_days := coalesce(p_keep_days, 30);
  if keep_days < 1 then keep_days := 1;
  elsif keep_days > 90 then keep_days := 90;
  end if;

  cutoff := now() - make_interval(days => keep_days);

  with doomed as (
    delete from public.todos
    where status = 'done'
      and completed_at < cutoff
    returning 1
  )
  select count(*)::integer into n from doomed;

  return coalesce(n, 0);
end;
$$;

create or replace function public.list_todos_ui()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me public.profiles;
begin
  me := public.current_profile();

  return coalesce(
    (
      select jsonb_agg(public.todo_ui_row(t) order by t.created_at desc)
      from public.todos t
    ),
    '[]'::jsonb
  );
end;
$$;

-- Push targets for explicit assignee ids (assign notifications).
create or replace function public.list_todo_push_targets(p_user_ids uuid[])
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

  return query
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.user_id = any (coalesce(p_user_ids, '{}'))
    and ps.user_id <> me.id;
end;
$$;

revoke all on function public.todo_ui_row(public.todos) from public, anon;
revoke all on function public.replace_todo_assignees(uuid, uuid[]) from public, anon;
revoke all on function public.create_todo(text, date, public.todo_priority, uuid[]) from public, anon;
revoke all on function public.update_todo(uuid, text, date, public.todo_priority, uuid[]) from public, anon;
revoke all on function public.complete_todo(uuid) from public, anon;
revoke all on function public.delete_todo(uuid) from public, anon;
revoke all on function public.purge_old_todos(integer) from public, anon;
revoke all on function public.list_todos_ui() from public, anon;
revoke all on function public.list_todo_push_targets(uuid[]) from public, anon;

grant execute on function public.create_todo(text, date, public.todo_priority, uuid[]) to authenticated;
grant execute on function public.update_todo(uuid, text, date, public.todo_priority, uuid[]) to authenticated;
grant execute on function public.complete_todo(uuid) to authenticated;
grant execute on function public.delete_todo(uuid) to authenticated;
grant execute on function public.purge_old_todos(integer) to authenticated;
grant execute on function public.list_todos_ui() to authenticated;
grant execute on function public.list_todo_push_targets(uuid[]) to authenticated;

alter publication supabase_realtime add table public.todos;
