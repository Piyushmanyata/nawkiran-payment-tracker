-- Restore requester-only correction, harden push target access, and optimize
-- push subscription policies for one auth lookup per statement.

create or replace function public.correct_denied_payment(
  p_payment_id uuid,
  p_party text,
  p_amount numeric,
  p_due_date date default null,
  p_purpose text default null
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  row public.payments;
  old public.payment_status;
  party_clean text;
  purpose_clean text;
  prior_reason text;
begin
  me := public.current_profile();

  select * into row
  from public.payments
  where id = p_payment_id
    and deleted_at is null
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if row.status <> 'denied' then
    raise exception 'ALREADY_PROCESSED' using errcode = 'P0001';
  end if;

  if row.requested_by <> me.id and me.role <> 'admin' then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  party_clean := trim(p_party);
  if party_clean is null or char_length(party_clean) < 1 or char_length(party_clean) > 150 then
    raise exception 'INVALID_PARTY' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  purpose_clean := nullif(trim(coalesce(p_purpose, '')), '');
  if purpose_clean is not null and char_length(purpose_clean) > 500 then
    raise exception 'INVALID_PURPOSE' using errcode = 'P0001';
  end if;

  old := row.status;
  prior_reason := row.denial_reason;

  update public.payments
  set
    party = party_clean,
    amount = round(p_amount, 2),
    due_date = p_due_date,
    purpose = purpose_clean,
    status = 'pending',
    denied_by = null,
    denied_at = null,
    denial_reason = null,
    approved_by = null,
    approved_at = null,
    updated_at = now(),
    version = version + 1
  where id = p_payment_id
  returning * into row;

  insert into public.payment_events (
    payment_id, action, performed_by, old_status, new_status, note
  ) values (
    row.id,
    'resubmitted',
    me.id,
    old,
    'pending',
    case
      when prior_reason is null then 'Corrected and resubmitted'
      else 'Corrected and resubmitted (was denied: ' || left(prior_reason, 200) || ')'
    end
  );

  return row;
end;
$$;

revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text)
  from public, anon;
grant execute on function public.correct_denied_payment(uuid, text, numeric, date, text)
  to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

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
    order by e.id desc limit 1;
  else
    select e.performed_by, e.created_at into actor_id, event_at
    from public.payment_events e
    where e.payment_id = pay.id
      and e.action = event_clean
    order by e.id desc limit 1;
  end if;

  -- Authorize from the immutable lifecycle event, not the payment's current
  -- state, so a fast subsequent transition cannot make a valid push disappear.
  if actor_id is null or actor_id <> me
     or event_at < now() - interval '2 hours' then
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

drop function if exists public.delete_stale_push_subscription(text);
drop function if exists public.delete_stale_push_subscription(text, uuid, text);
