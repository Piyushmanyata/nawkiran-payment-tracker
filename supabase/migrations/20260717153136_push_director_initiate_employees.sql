-- Director/admin auto-approve on create must notify employees.
-- Resolve "approved" actor from either the approved event or the
-- auto-approved create event (new_status = approved).

create or replace function public.list_push_targets(
  p_payment_id uuid,
  p_event text
)
returns table (
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  pay public.payments;
  event_clean text := lower(trim(coalesce(p_event, '')));
  actor_id uuid;
  event_at timestamptz;
  target_roles text[];
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if event_clean not in ('pending', 'approved', 'denied', 'paid') then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;

  select * into pay
  from public.payments
  where id = p_payment_id;

  if pay.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if event_clean = 'pending' then
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and e.action in ('created', 'resubmitted')
      and e.new_status = 'pending'
    order by e.id desc
    limit 1;
  elsif event_clean = 'approved' then
    -- Manual approve, or director/admin initiate (auto-approved create).
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and (
        e.action = 'approved'
        or (e.action = 'created' and e.new_status = 'approved')
      )
    order by e.id desc
    limit 1;
  else
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and e.action = event_clean
    order by e.id desc
    limit 1;
  end if;

  if actor_id is null or actor_id <> me
     or event_at < now() - interval '2 hours' then
    return;
  end if;

  -- pending (employee/accounts initiate) → director/admin
  -- approved (director initiate OR approve) → employee/accounts
  -- denied → employee/accounts
  -- paid → director/admin
  target_roles := case event_clean
    when 'pending' then array['director', 'admin']
    when 'approved' then array['employee', 'accounts']
    when 'denied' then array['employee', 'accounts']
    when 'paid' then array['director', 'admin']
  end;

  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where p.active = true
    and s.user_id <> me
    and p.role = any (target_roles);
end;
$$;

revoke all on function public.list_push_targets(uuid, text) from public, anon;
grant execute on function public.list_push_targets(uuid, text) to authenticated;
