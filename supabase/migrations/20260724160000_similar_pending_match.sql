-- Similar Pending Match: boolean-only existence check for Employee submit warning (ADR-0002).
-- SECURITY DEFINER so Employees can learn existence across Pending visibility without row details.

create or replace function public.parties_similar(p_a text, p_b text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  a text := lower(regexp_replace(trim(coalesce(p_a, '')), '\s+', ' ', 'g'));
  b text := lower(regexp_replace(trim(coalesce(p_b, '')), '\s+', ' ', 'g'));
  shorter text;
  longer text;
begin
  if a = '' or b = '' then
    return false;
  end if;
  if a = b then
    return true;
  end if;
  if char_length(a) <= char_length(b) then
    shorter := a;
    longer := b;
  else
    shorter := b;
    longer := a;
  end if;
  if char_length(shorter) < 5 then
    return false;
  end if;
  return position(shorter in longer) > 0;
end;
$$;

revoke all on function public.parties_similar(text, text) from public, anon, authenticated;

create or replace function public.has_similar_pending_payment(
  p_party text,
  p_amount numeric
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me public.profiles;
  party_clean text;
  amount_clean numeric(14,2);
begin
  me := public.current_profile();

  if me.role not in ('employee', 'director', 'accounts', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  party_clean := trim(coalesce(p_party, ''));
  if party_clean = '' or char_length(party_clean) > 150 then
    raise exception 'INVALID_PARTY' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  amount_clean := round(p_amount, 2);

  return exists (
    select 1
    from public.payments p
    where p.status = 'pending'
      and p.deleted_at is null
      and p.amount = amount_clean
      and public.parties_similar(party_clean, p.party)
  );
end;
$$;

revoke all on function public.has_similar_pending_payment(text, numeric) from public, anon;
grant execute on function public.has_similar_pending_payment(text, numeric) to authenticated;

comment on function public.has_similar_pending_payment(text, numeric) is
  'Boolean-only Similar Pending Match (ADR-0002). Never returns matching payment fields.';

-- Speed: filter Pending by exact amount before party similarity.
create index if not exists payments_pending_amount_idx
  on public.payments (amount)
  where status = 'pending' and deleted_at is null;
