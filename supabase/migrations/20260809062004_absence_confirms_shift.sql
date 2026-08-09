-- Recording an absence confirms the Shift (ADR-0012).
-- The explicit "mark shift done" tap is gone; upsert_attendance_entry now fills
-- confirmed_by/confirmed_at when they are null. Set-if-null, so they keep
-- recording who FIRST accounted for the Shift and never drift on later edits.
-- Both roles, one rule.
--
-- Consequence: a confirmed Shift is no longer read-only (inverts ADR-0006 §2).
-- The CONFIRMED guards must go, or the first absence would lock the Supervisor
-- out of the second.
--
-- delete_attendance_entry neither confirms nor un-confirms: removing the last
-- absence leaves the Shift reading "everyone came", which is true — someone
-- looked. confirm_attendance_shift and reopen_attendance_shift are unchanged;
-- confirm now backs the "No, everyone came" answer on an empty Shift.
--
-- Forward migration only; do not edit already-applied attendance migrations.
-- Bodies carry over the concurrent day-insert retry from 20260804130100 and the
-- always-audit-Admin rule from 20260807120000 (ADR-0011 §3).

create or replace function public.upsert_attendance_entry(
  p_work_date date,
  p_shift text,
  p_worker_id uuid,
  p_informed boolean,
  p_reason text,
  p_note text default null,
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
  reason_clean text;
  note_clean text;
  locked boolean;
  old_json jsonb;
  day_old_json jsonb;
  confirmed_now boolean := false;
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

  select * into day
  from public.attendance_days
  where company = company_clean
    and work_date = p_work_date
    and shift = shift_clean
  for update;

  -- A Shift born from an absence is confirmed by the same write (ADR-0012).
  if day.id is null then
    insert into public.attendance_days (
      company, work_date, shift, confirmed_by, confirmed_at
    ) values (
      company_clean, p_work_date, shift_clean, me.id, now()
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
    else
      confirmed_now := true;
    end if;
  end if;

  -- Set-if-null: never overwrite who first accounted for the Shift.
  if not confirmed_now and day.confirmed_at is null then
    day_old_json := to_jsonb(day);

    update public.attendance_days
    set
      confirmed_by = me.id,
      confirmed_at = now()
    where id = day.id
    returning * into day;

    confirmed_now := true;
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
      informed = p_informed,
      reason = reason_clean,
      note = note_clean,
      recorded_by = me.id,
      updated_at = now()
    where id = existing.id
    returning * into row;

    if me.role = 'admin' then
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
      informed,
      reason,
      note,
      recorded_by
    ) values (
      day.id,
      p_worker_id,
      p_informed,
      reason_clean,
      note_clean,
      me.id
    )
    returning * into row;

    if me.role = 'admin' then
      insert into public.attendance_events (
        attendance_day_id, entry_id, action, performed_by, old_value, new_value
      ) values (
        day.id, row.id, 'entry_created', me.id, null, to_jsonb(row)
      );
    end if;
  end if;

  -- An Admin write that also confirmed the Shift is audited as both (ADR-0011 §3).
  if confirmed_now and me.role = 'admin' then
    insert into public.attendance_events (
      attendance_day_id, entry_id, action, performed_by, old_value, new_value
    ) values (
      day.id, null, 'shift_confirmed', me.id, day_old_json, to_jsonb(day)
    );
  end if;

  update public.attendance_days
  set updated_at = now()
  where id = day.id;

  return row;
end;
$$;

revoke all on function public.upsert_attendance_entry(
  date, text, uuid, boolean, text, text, text
) from public, anon;
grant execute on function public.upsert_attendance_entry(
  date, text, uuid, boolean, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- delete_attendance_entry — a confirmed Shift stays editable until the Lock
-- ---------------------------------------------------------------------------
create or replace function public.delete_attendance_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  entry public.attendance_entries;
  day public.attendance_days;
  locked boolean;
  old_json jsonb;
begin
  me := public.current_profile();

  if me.role not in ('supervisor', 'admin') then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  select * into entry
  from public.attendance_entries
  where id = p_entry_id
  for update;

  if entry.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into day
  from public.attendance_days
  where id = entry.attendance_day_id
  for update;

  if day.id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if me.role = 'supervisor' then
    if me.company is null or day.company is distinct from me.company then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
  end if;

  locked := public.attendance_locked(day.work_date);
  if locked and me.role <> 'admin' then
    raise exception 'LOCKED' using errcode = 'P0001';
  end if;

  old_json := to_jsonb(entry);

  delete from public.attendance_entries where id = entry.id;

  if me.role = 'admin' then
    insert into public.attendance_events (
      attendance_day_id, entry_id, action, performed_by, old_value, new_value
    ) values (
      day.id, entry.id, 'entry_deleted', me.id, old_json, null
    );
  end if;

  -- Deliberately does not un-confirm: removing the last absence leaves the
  -- Shift reading "everyone came", which is true — someone looked (ADR-0012).
  update public.attendance_days
  set updated_at = now()
  where id = day.id;
end;
$$;

revoke all on function public.delete_attendance_entry(uuid) from public, anon;
grant execute on function public.delete_attendance_entry(uuid) to authenticated;
