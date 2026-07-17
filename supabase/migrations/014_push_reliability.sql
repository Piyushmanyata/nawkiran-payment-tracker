-- Push reliability: longer target window + index for role fan-out joins.
-- 10 minutes was too tight when server actions were slow or clocks skewed.

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
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if event_clean not in ('pending', 'approved', 'denied', 'paid') then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;

  select * into pay
  from public.payments
  where id = p_payment_id
    and deleted_at is null;

  if pay.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Allow delayed notify (slow network / server action queue) without spam
  if pay.updated_at < now() - interval '2 hours'
     and pay.requested_at < now() - interval '2 hours' then
    return;
  end if;

  if event_clean = 'pending' and pay.status <> 'pending' then
    return;
  end if;
  if event_clean = 'approved' and pay.status <> 'approved' then
    return;
  end if;
  if event_clean = 'denied' and pay.status <> 'denied' then
    return;
  end if;
  if event_clean = 'paid' and pay.status <> 'paid' then
    return;
  end if;

  if event_clean in ('pending', 'approved') then
    return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.active = true
      and s.user_id <> me
      and (
        (event_clean = 'pending' and p.role in ('director', 'admin'))
        or
        (event_clean = 'approved' and p.role in ('employee', 'accounts', 'admin'))
      );
  else
    -- denied / paid → requester (all their devices)
    return query
    select s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.profiles p on p.id = s.user_id
    where p.active = true
      and s.user_id = pay.requested_by
      and s.user_id <> me;
  end if;
end;
$$;

revoke all on function public.list_push_targets(uuid, text) from public, anon;
grant execute on function public.list_push_targets(uuid, text) to authenticated;

-- Speed role fan-out: active profile lookup by role used in list_push_targets
create index if not exists profiles_active_role_idx
  on public.profiles(role)
  where active = true;
