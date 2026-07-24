-- Guard push target RPCs to target only active profiles

create or replace function public.list_todo_update_request_push_targets(
  p_todo_id uuid,
  p_actor_id uuid default null
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
  v_actor_id uuid;
  has_assignees boolean;
begin
  if p_todo_id is null then return; end if;

  v_actor_id := coalesce(p_actor_id, (public.current_profile()).id);

  select exists(
    select 1 from public.todo_assignees where todo_id = p_todo_id
  ) into has_assignees;

  if has_assignees then
    return query
    select ps.endpoint, ps.p256dh, ps.auth
    from public.push_subscriptions ps
    join public.profiles pr on pr.id = ps.user_id
    where pr.active = true
      and (v_actor_id is null or ps.user_id <> v_actor_id)
      and exists (
        select 1 from public.todo_assignees ta
        where ta.todo_id = p_todo_id and ta.profile_id = ps.user_id
      );
  else
    return query
    select ps.endpoint, ps.p256dh, ps.auth
    from public.push_subscriptions ps
    join public.profiles pr on pr.id = ps.user_id
    where pr.active = true
      and (v_actor_id is null or ps.user_id <> v_actor_id)
      and exists (
        select 1 from public.todos t
        where t.id = p_todo_id and t.created_by = ps.user_id
      );
  end if;
end;
$$;

create or replace function public.list_todo_update_reply_push_targets(
  p_todo_id uuid,
  p_target_user_ids uuid[],
  p_actor_id uuid default null
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
  v_actor_id uuid;
begin
  if p_todo_id is null or p_target_user_ids is null then return; end if;
  v_actor_id := coalesce(p_actor_id, (public.current_profile()).id);

  return query
  select ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  join public.profiles pr on pr.id = ps.user_id
  where pr.active = true
    and ps.user_id = any(p_target_user_ids)
    and (v_actor_id is null or ps.user_id <> v_actor_id);
end;
$$;

revoke execute on function public.list_todo_update_request_push_targets(uuid, uuid) from public, anon;
revoke execute on function public.list_todo_update_reply_push_targets(uuid, uuid[], uuid) from public, anon;

grant execute on function public.list_todo_update_request_push_targets(uuid, uuid) to authenticated;
grant execute on function public.list_todo_update_reply_push_targets(uuid, uuid[], uuid) to authenticated;
