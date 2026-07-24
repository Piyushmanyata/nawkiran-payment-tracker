-- Migration: Recurring To-dos (In-place Reset & Calendar Schedules)

alter table public.todos
  add column if not exists recurrence_rule jsonb;

create or replace function public.calculate_next_due_date(
  p_current_due date,
  p_rule jsonb
)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
  today_date date := current_date;
  base date := coalesce(p_current_due, today_date);
  cur date := base;
  dom integer;
  d_arr jsonb;
  iso_day integer;
  safety integer := 0;
begin
  if p_rule is null then return null; end if;
  t := p_rule->>'type';
  if t is null or t = 'none' then return null; end if;

  if t = 'daily' then
    loop
      cur := (cur + interval '1 day')::date;
      exit when cur > today_date;
    end loop;
    return cur;
  elsif t = 'weekly' then
    loop
      cur := (cur + interval '1 week')::date;
      exit when cur > today_date;
    end loop;
    return cur;
  elsif t = 'monthly' then
    loop
      cur := (cur + interval '1 month')::date;
      exit when cur > today_date;
    end loop;
    return cur;
  elsif t = 'yearly' then
    loop
      cur := (cur + interval '1 year')::date;
      exit when cur > today_date;
    end loop;
    return cur;
  elsif t = 'custom_weekly' then
    d_arr := p_rule->'days_of_week';
    if d_arr is null or jsonb_array_length(d_arr) = 0 then return null; end if;
    loop
      cur := (cur + interval '1 day')::date;
      iso_day := extract(isodow from cur)::integer;
      if d_arr @> to_jsonb(iso_day) and cur > today_date then
        return cur;
      end if;
      safety := safety + 1;
      exit when safety >= 366;
    end loop;
    return cur;
  elsif t = 'custom_monthly' then
    dom := coalesce((p_rule->>'day_of_month')::integer, 1);
    if dom < 1 then dom := 1; elsif dom > 31 then dom := 31; end if;
    loop
      cur := (cur + interval '1 day')::date;
      if extract(day from cur)::integer = dom and cur > today_date then
        return cur;
      end if;
      safety := safety + 1;
      exit when safety >= 366;
    end loop;
    return cur;
  end if;

  return null;
end;
$$;

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
    'recurrence_rule', p_todo.recurrence_rule,
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
    ),
    'threads', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'todo_id', t.todo_id,
            'author_id', t.author_id,
            'author_name', p.full_name,
            'content', t.content,
            'type', t.type,
            'parent_id', t.parent_id,
            'created_at', t.created_at
          )
          order by t.created_at asc
        )
        from public.todo_threads t
        join public.profiles p on p.id = t.author_id
        where t.todo_id = p_todo.id
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.create_todo(
  p_title text,
  p_due_date date default null,
  p_priority public.todo_priority default 'normal',
  p_assignee_ids uuid[] default '{}',
  p_recurrence_rule jsonb default null
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

  insert into public.todos (title, priority, due_date, status, created_by, recurrence_rule)
  values (title_clean, pri, p_due_date, 'open', me.id, p_recurrence_rule)
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
  p_assignee_ids uuid[] default '{}',
  p_recurrence_rule jsonb default null
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
      priority = pri,
      recurrence_rule = p_recurrence_rule
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
  next_due date;
begin
  me := public.current_profile();

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if row.status = 'done' then
    raise exception 'ALREADY_DONE' using errcode = 'P0001';
  end if;

  next_due := public.calculate_next_due_date(row.due_date, row.recurrence_rule);

  if next_due is not null then
    -- In-place silent recurrence reset
    update public.todos
    set status = 'open',
        due_date = next_due,
        completed_by = null,
        completed_at = null
    where id = p_todo_id
    returning * into row;
  else
    update public.todos
    set status = 'done',
        completed_by = me.id,
        completed_at = now()
    where id = p_todo_id
    returning * into row;
  end if;

  return public.todo_ui_row(row);
end;
$$;

revoke all on function public.calculate_next_due_date(date, jsonb) from public, anon;
grant execute on function public.calculate_next_due_date(date, jsonb) to authenticated;
grant execute on function public.create_todo(text, date, public.todo_priority, uuid[], jsonb) to authenticated;
grant execute on function public.update_todo(uuid, text, date, public.todo_priority, uuid[], jsonb) to authenticated;
