-- Migration: Enforce recurring todo creator/admin edit permissions and completion due-date guard
-- 1. Recurring to-dos can only be edited by their originator (created_by) or an admin.
-- 2. Recurring to-dos cannot be marked complete before their scheduled due date.
-- 3. Delete to-do remains strictly admin-only.

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
  is_existing_rec boolean;
begin
  me := public.current_profile();

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if row.status <> 'open' then
    raise exception 'TODO_FROZEN' using errcode = 'P0001';
  end if;

  is_existing_rec := row.recurrence_rule is not null
                 and row.recurrence_rule->>'type' is not null
                 and row.recurrence_rule->>'type' <> 'none';

  if is_existing_rec then
    if me.id <> row.created_by and me.role <> 'admin' then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
  else
    if me.id <> row.created_by and me.role not in ('director', 'admin') then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
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

revoke all on function public.update_todo(uuid, text, date, public.todo_priority, uuid[], jsonb) from public, anon;
grant execute on function public.update_todo(uuid, text, date, public.todo_priority, uuid[], jsonb) to authenticated;

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
  today_ist date;
begin
  me := public.current_profile();

  select * into row from public.todos where id = p_todo_id for update;
  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if row.status = 'done' then
    raise exception 'ALREADY_DONE' using errcode = 'P0001';
  end if;

  today_ist := (timezone('Asia/Kolkata', now()))::date;

  if row.recurrence_rule is not null
     and row.recurrence_rule->>'type' is not null
     and row.recurrence_rule->>'type' <> 'none'
     and row.due_date is not null
     and row.due_date > today_ist then
    raise exception 'RECURRING_NOT_DUE' using errcode = 'P0001';
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

revoke all on function public.complete_todo(uuid) from public, anon;
grant execute on function public.complete_todo(uuid) to authenticated;
