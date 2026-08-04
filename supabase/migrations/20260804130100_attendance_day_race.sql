-- Avoid a raw unique-violation when two first writes create the same day.

create or replace function public.upsert_attendance_entry(
  p_work_date date,
  p_shift text,
  p_worker_id uuid,
  p_kind text,
  p_informed boolean default null,
  p_reason text default null,
  p_note text default null,
  p_lent_to_company text default null,
  p_company text default null
)
returns public.attendance_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  worker public.workers;
  day public.attendance_days;
  existing public.attendance_entries;
  row public.attendance_entries;
  company_clean text;
  shift_clean text;
  kind_clean text;
  reason_clean text;
  note_clean text;
  lent_clean text;
  locked boolean;
  old_json jsonb;
begin
  me := public.current_profile();

  if me.role not in ('supervisor', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  if p_work_date is null then
    raise exception 'INVALID_DATE' using errcode = 'P0001';
  end if;

  shift_clean := lower(trim(coalesce(p_shift, '')));
  if shift_clean not in ('day', 'night') then
    raise exception 'INVALID_SHIFT' using errcode = 'P0001';
  end if;

  kind_clean := lower(trim(coalesce(p_kind, '')));
  if kind_clean not in ('absent', 'weekly_off', 'lent_out') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;

  select * into worker
  from public.workers
  where id = p_worker_id;

  if worker.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if me.role = 'supervisor' then
    if not worker.active
       or me.company is null
       or worker.company is distinct from me.company then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
    company_clean := me.company;
  else
    company_clean := coalesce(
      nullif(upper(trim(coalesce(p_company, ''))), ''),
      worker.company
    );
    if company_clean not in ('NKPL', 'APTUS') then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
    if worker.company is distinct from company_clean then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
  end if;

  locked := public.attendance_locked(p_work_date);
  if locked and me.role <> 'admin' then
    raise exception 'LOCKED' using errcode = 'P0001';
  end if;

  if kind_clean = 'absent' then
    if p_informed is null then
      raise exception 'INVALID_INFORMED' using errcode = 'P0001';
    end if;
    reason_clean := lower(trim(coalesce(p_reason, '')));
    if reason_clean not in (
      'sick', 'family', 'village', 'festival', 'no_information', 'other'
    ) then
      raise exception 'INVALID_REASON' using errcode = 'P0001';
    end if;
    note_clean := nullif(trim(coalesce(p_note, '')), '');
    if reason_clean = 'other'
       and (note_clean is null or char_length(note_clean) < 1) then
      raise exception 'INVALID_NOTE' using errcode = 'P0001';
    end if;
    if note_clean is not null and char_length(note_clean) > 200 then
      raise exception 'INVALID_NOTE' using errcode = 'P0001';
    end if;
    lent_clean := null;
  else
    reason_clean := null;
    note_clean := nullif(trim(coalesce(p_note, '')), '');
    if note_clean is not null and char_length(note_clean) > 200 then
      raise exception 'INVALID_NOTE' using errcode = 'P0001';
    end if;
    if kind_clean = 'lent_out' then
      lent_clean := upper(trim(coalesce(p_lent_to_company, '')));
      if lent_clean not in ('NKPL', 'APTUS') then
        raise exception 'INVALID_LENT_TO' using errcode = 'P0001';
      end if;
      if lent_clean = company_clean then
        raise exception 'LENT_TO_SAME_COMPANY' using errcode = 'P0001';
      end if;
    else
      lent_clean := null;
    end if;
  end if;

  select * into day
  from public.attendance_days
  where company = company_clean
    and work_date = p_work_date
    and shift = shift_clean
  for update;

  if day.id is null then
    insert into public.attendance_days (
      company, work_date, shift
    ) values (
      company_clean, p_work_date, shift_clean
    )
    on conflict (company, work_date, shift) do nothing
    returning * into day;

    if day.id is null then
      select * into day
      from public.attendance_days
      where company = company_clean
        and work_date = p_work_date
        and shift = shift_clean
      for update;
    end if;
  end if;

  if me.role = 'supervisor' and day.confirmed_at is not null then
    raise exception 'CONFIRMED' using errcode = 'P0001';
  end if;

  select * into existing
  from public.attendance_entries
  where attendance_day_id = day.id
    and worker_id = p_worker_id
  for update;

  if existing.id is not null then
    old_json := to_jsonb(existing);

    update public.attendance_entries
    set
      kind = kind_clean,
      informed = case when kind_clean = 'absent' then p_informed else null end,
      reason = reason_clean,
      note = note_clean,
      lent_to_company = lent_clean,
      recorded_by = me.id,
      updated_at = now()
    where id = existing.id
    returning * into row;

    if locked and me.role = 'admin' then
      insert into public.attendance_events (
        attendance_day_id, entry_id, action, performed_by, old_value, new_value
      ) values (
        day.id, row.id, 'entry_updated', me.id, old_json, to_jsonb(row)
      );
    end if;
  else
    insert into public.attendance_entries (
      attendance_day_id,
      worker_id,
      kind,
      informed,
      reason,
      note,
      lent_to_company,
      recorded_by
    ) values (
      day.id,
      p_worker_id,
      kind_clean,
      case when kind_clean = 'absent' then p_informed else null end,
      reason_clean,
      note_clean,
      lent_clean,
      me.id
    )
    returning * into row;

    if locked and me.role = 'admin' then
      insert into public.attendance_events (
        attendance_day_id, entry_id, action, performed_by, old_value, new_value
      ) values (
        day.id, row.id, 'entry_created', me.id, null, to_jsonb(row)
      );
    end if;
  end if;

  update public.attendance_days
  set updated_at = now()
  where id = day.id;

  return row;
end;
$$;

revoke all on function public.upsert_attendance_entry(
  date, text, uuid, text, boolean, text, text, text, text
) from public, anon;
grant execute on function public.upsert_attendance_entry(
  date, text, uuid, text, boolean, text, text, text, text
) to authenticated;

create or replace function public.confirm_attendance_shift(
  p_work_date date,
  p_shift text,
  p_company text default null
)
returns public.attendance_days
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  day public.attendance_days;
  company_clean text;
  shift_clean text;
  locked boolean;
  old_json jsonb;
  inserted boolean := false;
begin
  me := public.current_profile();

  if me.role not in ('supervisor', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  if p_work_date is null then
    raise exception 'INVALID_DATE' using errcode = 'P0001';
  end if;

  shift_clean := lower(trim(coalesce(p_shift, '')));
  if shift_clean not in ('day', 'night') then
    raise exception 'INVALID_SHIFT' using errcode = 'P0001';
  end if;

  if me.role = 'supervisor' then
    if me.company is null then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
    company_clean := me.company;
  else
    company_clean := upper(trim(coalesce(p_company, '')));
    if company_clean not in ('NKPL', 'APTUS') then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
  end if;

  locked := public.attendance_locked(p_work_date);
  if locked and me.role <> 'admin' then
    raise exception 'LOCKED' using errcode = 'P0001';
  end if;

  select * into day
  from public.attendance_days
  where company = company_clean
    and work_date = p_work_date
    and shift = shift_clean
  for update;

  if day.id is null then
    insert into public.attendance_days (
      company, work_date, shift, confirmed_by, confirmed_at
    ) values (
      company_clean, p_work_date, shift_clean, me.id, now()
    )
    on conflict (company, work_date, shift) do nothing
    returning * into day;

    if day.id is not null then
      inserted := true;
    else
      select * into day
      from public.attendance_days
      where company = company_clean
        and work_date = p_work_date
        and shift = shift_clean
      for update;
    end if;
  end if;

  if inserted then
    if locked and me.role = 'admin' then
      insert into public.attendance_events (
        attendance_day_id, entry_id, action, performed_by, old_value, new_value
      ) values (
        day.id, null, 'shift_confirmed', me.id, null, to_jsonb(day)
      );
    end if;
    return day;
  end if;

  old_json := to_jsonb(day);

  update public.attendance_days
  set
    confirmed_by = me.id,
    confirmed_at = now(),
    updated_at = now()
  where id = day.id
  returning * into day;

  if locked and me.role = 'admin' then
    insert into public.attendance_events (
      attendance_day_id, entry_id, action, performed_by, old_value, new_value
    ) values (
      day.id, null, 'shift_confirmed', me.id, old_json, to_jsonb(day)
    );
  end if;

  return day;
end;
$$;

revoke all on function public.confirm_attendance_shift(date, text, text)
  from public, anon;
grant execute on function public.confirm_attendance_shift(date, text, text)
  to authenticated;
