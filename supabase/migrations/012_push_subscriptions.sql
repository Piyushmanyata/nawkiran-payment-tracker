-- Free Web Push: store browser push subscriptions (VAPID / Web Push API).
-- No third-party push vendor required.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create index push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Users manage only their own device subscriptions.
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Upsert helper so the client can replace keys for the same endpoint.
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  row public.push_subscriptions;
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_endpoint is null or char_length(trim(p_endpoint)) < 10 then
    raise exception 'INVALID_ENDPOINT' using errcode = 'P0001';
  end if;

  if p_p256dh is null or p_auth is null then
    raise exception 'INVALID_KEYS' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent
  ) values (
    me, trim(p_endpoint), trim(p_p256dh), trim(p_auth), nullif(trim(coalesce(p_user_agent, '')), '')
  )
  on conflict (endpoint) do update
    set
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      updated_at = now()
  returning * into row;

  return row;
end;
$$;

grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;

create or replace function public.delete_push_subscription(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  delete from public.push_subscriptions
  where endpoint = trim(p_endpoint)
    and user_id = me;
end;
$$;

grant execute on function public.delete_push_subscription(text) to authenticated;

-- Clean dead endpoints after web-push returns 404/410 (any signed-in staff).
create or replace function public.delete_stale_push_subscription(
  p_endpoint text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  delete from public.push_subscriptions
  where endpoint = trim(p_endpoint);
end;
$$;

grant execute on function public.delete_stale_push_subscription(text) to authenticated;

-- Targets for a payment lifecycle event (excludes the caller).
-- pending  → director, admin
-- approved → employee, accounts, admin (payers)
-- denied   → requester
-- paid     → requester
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
  where id = p_payment_id;

  if pay.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Limit spam: only recent payment activity
  if pay.updated_at < now() - interval '10 minutes'
     and pay.requested_at < now() - interval '10 minutes' then
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
    -- denied / paid → requester
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

grant execute on function public.list_push_targets(uuid, text) to authenticated;

-- Harden: no anon execute (matches later revoke migrations)
revoke all on function public.upsert_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.delete_stale_push_subscription(text) from public, anon;
revoke all on function public.list_push_targets(uuid, text) from public, anon;

grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.delete_stale_push_subscription(text) to authenticated;
grant execute on function public.list_push_targets(uuid, text) to authenticated;
