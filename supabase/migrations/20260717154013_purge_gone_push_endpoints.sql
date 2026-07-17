-- Purge Web Push endpoints that push services report as gone (404/410).
-- Endpoints are long unguessable URLs; only signed-in lifecycle actors call this
-- after a delivery attempt fails with a terminal push status.

create or replace function public.purge_push_endpoint(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_endpoint is null or char_length(trim(p_endpoint)) < 20 then
    return;
  end if;

  delete from public.push_subscriptions
  where endpoint = trim(p_endpoint);
end;
$$;

revoke all on function public.purge_push_endpoint(text) from public, anon;
grant execute on function public.purge_push_endpoint(text) to authenticated;
