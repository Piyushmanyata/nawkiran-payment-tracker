-- Directors and Admins soft-delete Approved + history payments (ADR-0004).
-- Replaces admin_delete_payment with delete_payment; event action is `deleted`.

alter table public.payment_events
  drop constraint if exists payment_events_action_check;

alter table public.payment_events
  add constraint payment_events_action_check
  check (action in (
    'created',
    'approved',
    'denied',
    'paid',
    'resubmitted',
    'edited',
    'withdrawn',
    'admin_deleted',
    'deleted'
  ));

create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
begin
  me := public.current_profile();

  if me.role not in ('director', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id and deleted_at is null
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status not in ('approved', 'paid', 'denied', 'withdrawn') then
    raise exception 'NOT_DELETABLE' using errcode = 'P0001';
  end if;

  update public.payments
  set deleted_at = now(), deleted_by = me.id, updated_at = now()
  where id = p_payment_id;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id, 'deleted', me.id, row.status, row.status,
    'Soft-deleted by ' || me.role
  );
end;
$$;

revoke all on function public.delete_payment(uuid) from public, anon;
grant execute on function public.delete_payment(uuid) to authenticated;

-- Old RPC name retired; clients call delete_payment only.
drop function if exists public.admin_delete_payment(uuid);

-- Soft-deleted approved rows must also age out of the hard-delete sweep.
create or replace function public.purge_old_payment_history(
  p_keep_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_days integer;
  cutoff timestamptz;
  ids uuid[];
  n integer := 0;
begin
  perform public.current_profile();

  keep_days := coalesce(p_keep_days, 30);
  if keep_days < 1 then
    keep_days := 1;
  elsif keep_days > 90 then
    keep_days := 90;
  end if;

  cutoff := now() - make_interval(days => keep_days);

  select coalesce(array_agg(id), '{}')
  into ids
  from public.payments
  where
    (deleted_at is not null and status in ('approved', 'paid', 'denied', 'withdrawn'))
    or (
      status in ('paid', 'withdrawn')
      and coalesce(paid_at, updated_at) < cutoff
    );

  n := coalesce(cardinality(ids), 0);
  if n = 0 then
    return 0;
  end if;

  perform set_config('app.allow_history_purge', 'on', true);

  delete from public.payment_events
  where payment_id = any (ids);

  delete from public.payments
  where id = any (ids);

  return n;
end;
$$;

revoke all on function public.purge_old_payment_history(integer)
  from public, anon;
grant execute on function public.purge_old_payment_history(integer)
  to authenticated;

-- Push: deleted (approved only from client) → employees + legacy accounts.
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
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if event_clean not in ('pending', 'approved', 'denied', 'paid', 'deleted') then
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
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and (
        e.action = 'approved'
        or (e.action = 'created' and e.new_status = 'approved')
      )
    order by e.id desc
    limit 1;
  elsif event_clean = 'deleted' then
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and e.action = 'deleted'
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

  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where p.active = true
    and s.user_id <> me
    and (
      (event_clean = 'pending' and p.role in ('director', 'admin'))
      or (event_clean = 'approved' and (p.role in ('employee', 'accounts', 'admin') or s.user_id = pay.requested_by))
      or (event_clean = 'denied' and (s.user_id = pay.requested_by or p.role = 'admin'))
      or (event_clean = 'paid' and (p.role in ('director', 'admin') or s.user_id = pay.requested_by))
      or (
        event_clean = 'deleted'
        and pay.status = 'approved'
        and p.role in ('employee', 'accounts')
      )
    );
end;
$$;

revoke all on function public.list_push_targets(uuid, text) from public, anon;
grant execute on function public.list_push_targets(uuid, text) to authenticated;

-- Allow push context after soft-delete for the deleted event only.
create or replace function public.payment_push_context(
  p_payment_id uuid,
  p_event text
)
returns table (
  party text,
  amount numeric,
  denial_reason text,
  version integer,
  actor_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  me uuid := auth.uid();
  event_clean text := lower(trim(coalesce(p_event, '')));
  actor_id uuid;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if event_clean not in ('pending', 'approved', 'denied', 'paid', 'deleted') then
    raise exception 'INVALID_EVENT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.profiles pr
    where pr.id = me and pr.active = true
  ) then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  if event_clean = 'pending' then
    select e.performed_by into actor_id
    from public.payment_events e
    where e.payment_id = p_payment_id
      and e.action in ('created', 'resubmitted')
      and e.new_status = 'pending'
    order by e.id desc
    limit 1;
  elsif event_clean = 'approved' then
    select e.performed_by into actor_id
    from public.payment_events e
    where e.payment_id = p_payment_id
      and (
        e.action = 'approved'
        or (e.action = 'created' and e.new_status = 'approved')
      )
    order by e.id desc
    limit 1;
  elsif event_clean = 'deleted' then
    select e.performed_by into actor_id
    from public.payment_events e
    where e.payment_id = p_payment_id
      and e.action = 'deleted'
    order by e.id desc
    limit 1;
  else
    select e.performed_by into actor_id
    from public.payment_events e
    where e.payment_id = p_payment_id
      and e.action = event_clean
    order by e.id desc
    limit 1;
  end if;

  return query
  select
    p.party,
    p.amount,
    p.denial_reason,
    p.version,
    coalesce(
      nullif(trim(pr.full_name), ''),
      nullif(trim(fallback.full_name), ''),
      'Someone'
    ) as actor_name
  from public.payments p
  left join public.profiles pr on pr.id = actor_id
  left join public.profiles fallback on fallback.id = case event_clean
    when 'pending' then p.requested_by
    when 'approved' then coalesce(p.approved_by, p.requested_by)
    when 'denied' then p.denied_by
    when 'paid' then p.paid_by
    when 'deleted' then coalesce(p.deleted_by, me)
  end
  where p.id = p_payment_id
    and (p.deleted_at is null or event_clean = 'deleted');
end;
$$;

revoke all on function public.payment_push_context(uuid, text)
  from public, anon;
grant execute on function public.payment_push_context(uuid, text)
  to authenticated;
