-- Admin may delete paid/denied history; create Nawneet director if missing

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

-- Nawneet: create Auth user + director profile if not present
-- Password: Nawneet@Pay1
do $$
declare
  uid uuid;
  existing_id uuid;
begin
  select id into existing_id
  from auth.users
  where email = 'nawneet@nawkiran.com'
  limit 1;

  if existing_id is not null then
    uid := existing_id;
    update auth.users
    set email_confirmed_at = coalesce(email_confirmed_at, now())
    where id = uid;
  else
    uid := gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      uid,
      'authenticated',
      'authenticated',
      'nawneet@nawkiran.com',
      crypt('Nawneet@Pay1', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Nawneet"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      uid,
      uid::text,
      jsonb_build_object('sub', uid::text, 'email', 'nawneet@nawkiran.com'),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  insert into public.profiles (id, full_name, role, active)
  values (uid, 'Nawneet', 'director', true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      active = true;
end $$;
