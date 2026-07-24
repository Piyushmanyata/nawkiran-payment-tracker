-- Migration: Collapsible To-do Update Threads and Push Target Resolution

create type public.todo_thread_type as enum ('request', 'reply');

create table public.todo_threads (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  content text not null check (char_length(trim(content)) between 1 and 1000),
  type public.todo_thread_type not null default 'request',
  parent_id uuid references public.todo_threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint todo_threads_parent_type_check check (
    (type = 'request' and parent_id is null) or
    (type = 'reply' and parent_id is not null)
  )
);

create index todo_threads_todo_id_created_at_idx
  on public.todo_threads (todo_id, created_at asc);

create index todo_threads_parent_id_idx
  on public.todo_threads (parent_id)
  where parent_id is not null;

create index todo_threads_author_id_idx
  on public.todo_threads (author_id);

alter table public.todo_threads enable row level security;

create policy todo_threads_select
  on public.todo_threads
  for select
  to authenticated
  using (public.is_active_user());

create policy todo_threads_no_direct_insert
  on public.todo_threads for insert to authenticated with check (false);

create policy todo_threads_no_direct_update
  on public.todo_threads for update to authenticated using (false);

create policy todo_threads_no_direct_delete
  on public.todo_threads for delete to authenticated using (false);

-- Update todo_ui_row helper to aggregate threads
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
          jsonb_build_object('id', pr.id, 'full_name', pr.full_name)
          order by pr.full_name
        )
        from public.todo_assignees ta
        join public.profiles pr on pr.id = ta.profile_id
        where ta.todo_id = p_todo.id
      ),
      '[]'::jsonb
    ),
    'threads', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', tt.id,
            'todo_id', tt.todo_id,
            'author_id', tt.author_id,
            'author_name', pr.full_name,
            'content', tt.content,
            'type', tt.type,
            'parent_id', tt.parent_id,
            'created_at', tt.created_at
          )
          order by tt.created_at asc
        )
        from public.todo_threads tt
        join public.profiles pr on pr.id = tt.author_id
        where tt.todo_id = p_todo.id
      ),
      '[]'::jsonb
    )
  );
$$;

-- RPC: Request Update on Todo
create or replace function public.request_todo_update(
  p_todo_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  v_todo public.todos;
  v_content text;
  v_thread_id uuid;
begin
  me := public.current_profile();
  v_content := trim(coalesce(p_content, ''));
  if char_length(v_content) < 1 or char_length(v_content) > 1000 then
    raise exception 'Update request message must be 1 to 1000 characters.';
  end if;

  select * into v_todo from public.todos where id = p_todo_id for update;
  if not found then
    raise exception 'To-do not found.';
  end if;

  if v_todo.status <> 'open' then
    raise exception 'Cannot request updates on completed to-dos.';
  end if;

  insert into public.todo_threads (todo_id, author_id, content, type, parent_id)
  values (p_todo_id, me.id, v_content, 'request', null)
  returning id into v_thread_id;

  return public.todo_ui_row(v_todo);
end;
$$;

-- RPC: Reply to Todo Update Request
create or replace function public.reply_todo_update(
  p_todo_id uuid,
  p_parent_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  v_todo public.todos;
  v_parent public.todo_threads;
  v_content text;
  v_thread_id uuid;
begin
  me := public.current_profile();
  v_content := trim(coalesce(p_content, ''));
  if char_length(v_content) < 1 or char_length(v_content) > 1000 then
    raise exception 'Reply message must be 1 to 1000 characters.';
  end if;

  select * into v_todo from public.todos where id = p_todo_id for update;
  if not found then
    raise exception 'To-do not found.';
  end if;

  if v_todo.status <> 'open' then
    raise exception 'Cannot reply on completed to-dos.';
  end if;

  select * into v_parent from public.todo_threads where id = p_parent_id;
  if not found or v_parent.todo_id <> p_todo_id then
    raise exception 'Parent thread request not found.';
  end if;

  if v_parent.type <> 'request' then
    raise exception 'Replies can only be attached to update requests.';
  end if;

  insert into public.todo_threads (todo_id, author_id, content, type, parent_id)
  values (p_todo_id, me.id, v_content, 'reply', p_parent_id)
  returning id into v_thread_id;

  return public.todo_ui_row(v_todo);
end;
$$;

-- Push Target Resolution for Update Request
create or replace function public.list_todo_update_request_push_targets(
  p_todo_id uuid
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
  has_assignees boolean;
begin
  me := public.current_profile();
  if p_todo_id is null then return; end if;

  select exists(
    select 1 from public.todo_assignees where todo_id = p_todo_id
  ) into has_assignees;

  if has_assignees then
    return query
    select ps.endpoint, ps.p256dh, ps.auth
    from public.push_subscriptions ps
    where ps.user_id <> me.id
      and exists (
        select 1 from public.todo_assignees ta
        where ta.todo_id = p_todo_id and ta.profile_id = ps.user_id
      );
  else
    return query
    select ps.endpoint, ps.p256dh, ps.auth
    from public.push_subscriptions ps
    where ps.user_id <> me.id
      and exists (
        select 1 from public.todos t
        where t.id = p_todo_id and t.created_by = ps.user_id
      );
  end if;
end;
$$;

-- Push Target Resolution for Update Reply
create or replace function public.list_todo_update_reply_push_targets(
  p_todo_id uuid,
  p_target_user_ids uuid[]
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
  if p_todo_id is null or p_target_user_ids is null then return; end if;

  return query
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  where ps.user_id = any(p_target_user_ids)
    and ps.user_id <> me.id;
end;
$$;

alter publication supabase_realtime add table public.todo_threads;

revoke execute on function public.request_todo_update(uuid, text) from public, anon;
revoke execute on function public.reply_todo_update(uuid, uuid, text) from public, anon;
revoke execute on function public.list_todo_update_request_push_targets(uuid) from public, anon;
revoke execute on function public.list_todo_update_reply_push_targets(uuid, uuid[]) from public, anon;

grant execute on function public.request_todo_update(uuid, text) to authenticated;
grant execute on function public.reply_todo_update(uuid, uuid, text) to authenticated;
grant execute on function public.list_todo_update_request_push_targets(uuid) to authenticated;
grant execute on function public.list_todo_update_reply_push_targets(uuid, uuid[]) to authenticated;
