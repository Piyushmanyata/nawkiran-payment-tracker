-- One-shot push context: party/amount/version + the correct lifecycle actor name.
-- pending  → requester (created/resubmitted)
-- approved → approver (approve event or auto-approved create)
-- denied   → denier
-- paid     → payer

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

  if event_clean not in ('pending', 'approved', 'denied', 'paid') then
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
  else
    select e.performed_by into actor_id
    from public.payment_events e
    where e.payment_id = p_payment_id
      and e.action = event_clean
    order by e.id desc
    limit 1;
  end if;

  -- Fallback to payment FKs when the event row is missing (edge races).
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
  end
  where p.id = p_payment_id
    and p.deleted_at is null;
end;
$$;

revoke all on function public.payment_push_context(uuid, text)
  from public, anon;
grant execute on function public.payment_push_context(uuid, text)
  to authenticated;

-- Cover actor lookups used by list_push_targets + payment_push_context.
create index if not exists payment_events_payment_action_id_idx
  on public.payment_events (payment_id, action, id desc);
