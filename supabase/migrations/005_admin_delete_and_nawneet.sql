-- Admin may remove paid/denied history from the active UI.
-- User provisioning belongs in Supabase Auth, never in a database migration.

create or replace function public.admin_delete_payment(p_payment_id uuid)
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

  if me.role <> 'admin' then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into row
  from public.payments
  where id = p_payment_id
  for update;

  if row.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- History only (paid / denied). Open items stay protected.
  if row.status not in ('paid', 'denied') then
    raise exception 'NOT_HISTORY' using errcode = 'P0001';
  end if;

  delete from public.payment_events where payment_id = p_payment_id;
  delete from public.payments where id = p_payment_id;
end;
$$;

grant execute on function public.admin_delete_payment(uuid) to authenticated;
