-- Migration: 20260723222500_keep_only_open_requests.sql
-- Description: Purge all non-open payment requests (status paid or denied) from payments and payment_events,
--              retaining strictly open payment requests (status pending or approved).

do $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}')
  into ids
  from public.payments
  where status in ('paid', 'denied');

  if cardinality(ids) > 0 then
    perform set_config('app.allow_history_purge', 'on', true);

    delete from public.payment_events
    where payment_id = any(ids);

    delete from public.payments
    where id = any(ids);
  end if;
end;
$$;
