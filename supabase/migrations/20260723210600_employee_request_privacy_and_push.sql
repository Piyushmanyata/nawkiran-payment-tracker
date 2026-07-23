-- Migration: 20260723210600_employee_request_privacy_and_push.sql
-- Description: Restrict pending and denied requests so employees cannot see each other's unapproved requests.
--              Only approved/paid requests are visible to all employees.
--              Target push notifications accordingly (denied goes only to requester + admin).

-- 1. Update list_payments_ui() to enforce privacy filter
create or replace function public.list_payments_ui()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me_role text;
  me_id uuid := auth.uid();
  result jsonb;
begin
  if not public.is_active_user() then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select role into me_role
  from public.profiles
  where id = me_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'party', p.party,
        'amount', p.amount,
        'due_date', p.due_date,
        'purpose', p.purpose,
        'status', p.status,
        'requested_by', p.requested_by,
        'requested_at', p.requested_at,
        'approved_by', p.approved_by,
        'approved_at', p.approved_at,
        'denied_by', p.denied_by,
        'denied_at', p.denied_at,
        'denial_reason', p.denial_reason,
        'paid_by', p.paid_by,
        'paid_at', p.paid_at,
        'payment_mode', p.payment_mode,
        'payment_reference', p.payment_reference,
        'updated_at', p.updated_at,
        'version', p.version,
        'client_request_id', p.client_request_id,
        'requester_name', req.full_name,
        'requester_role', req.role,
        'approver_name', appr.full_name,
        'denier_name', den.full_name,
        'payer_name', pay.full_name
      )
      order by p.requested_at desc
    ),
    '[]'::jsonb
  )
  into result
  from public.payments p
  left join public.profiles req on req.id = p.requested_by
  left join public.profiles appr on appr.id = p.approved_by
  left join public.profiles den on den.id = p.denied_by
  left join public.profiles pay on pay.id = p.paid_by
  where p.deleted_at is null
    and (
      me_role in ('director', 'admin')
      or p.status in ('approved', 'paid')
      or p.requested_by = me_id
    );

  return result;
end;
$$;

revoke all on function public.list_payments_ui() from public, anon;
grant execute on function public.list_payments_ui() to authenticated;

-- 2. Update RLS policy for payments
drop policy if exists payments_select on public.payments;
create policy payments_select
  on public.payments
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('director', 'admin')
      or status in ('approved', 'paid')
      or requested_by = auth.uid()
    )
  );

-- 3. Update RLS policy for payment_events
drop policy if exists payment_events_select on public.payment_events;
create policy payment_events_select
  on public.payment_events
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('director', 'admin')
      or exists (
        select 1 from public.payments p
        where p.id = payment_id
          and (
            p.status in ('approved', 'paid')
            or p.requested_by = auth.uid()
          )
      )
    )
  );

-- 4. Update list_push_targets() to target denied pushes ONLY to requester & admins
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
    );
end;
$$;

revoke all on function public.list_push_targets(uuid, text) from public, anon;
grant execute on function public.list_push_targets(uuid, text) to authenticated;
