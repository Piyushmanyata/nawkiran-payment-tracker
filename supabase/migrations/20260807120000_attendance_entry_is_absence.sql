-- Attendance Entry is an absence (ADR-0010, ADR-0011, issue #16).
-- Drop kind + lent_to_company; informed/reason become not null.
-- Admin writes are always audited (not only post-lock).
-- Forward migration only; do not edit already-applied attendance migrations.
-- upsert body preserves concurrent day-insert retry from 20260804130100.

-- Defensive scrub: production has zero non-absent rows, but do not fail on strays.
delete from public.attendance_entries where kind is distinct from 'absent';

alter table public.attendance_entries
  drop constraint if exists attendance_entries_kind_check;

alter table public.attendance_entries
  drop constraint if exists attendance_entries_absent_fields_check;

alter table public.attendance_entries
  drop constraint if exists attendance_entries_lent_check;

alter table public.attendance_entries
  drop column if exists kind;

alter table public.attendance_entries
  drop column if exists lent_to_company;

-- Belt-and-braces before NOT NULL (production absences already satisfy this).
update public.attendance_entries
set informed = coalesce(informed, false)
where informed is null;

update public.attendance_entries
set reason = coalesce(nullif(trim(reason), ''), 'no_information')
where reason is null or trim(reason) = '';

alter table public.attendance_entries
  alter column informed set not null;

alter table public.attendance_entries
  alter column reason set not null;

-- other still requires a note; keep surviving check.
alter table public.attendance_entries
  drop constraint if exists attendance_entries_other_note_check;

alter table public.attendance_entries
  add constraint attendance_entries_other_note_check
  check (
    reason <> 'other'
    or (note is not null and char_length(trim(note)) >= 1)
  );

-- Drop old upsert signature (loses p_kind and p_lent_to_company).
drop function if exists public.upsert_attendance_entry(
  date, text, uuid, text, boolean, text, text, text, text
);

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
-- delete_attendance_entry — audit every Admin write
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

  if me.role = 'supervisor' and day.confirmed_at is not null then
    raise exception 'CONFIRMED' using errcode = 'P0001';
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

  update public.attendance_days
  set updated_at = now()
  where id = day.id;
end;
$$;

revoke all on function public.delete_attendance_entry(uuid) from public, anon;
grant execute on function public.delete_attendance_entry(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- confirm_attendance_shift — keep concurrent day-insert retry; audit Admin always
-- ---------------------------------------------------------------------------
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
    if me.role = 'admin' then
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

  if me.role = 'admin' then
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

-- ---------------------------------------------------------------------------
-- reopen_attendance_shift — audit Admin always
-- ---------------------------------------------------------------------------
create or replace function public.reopen_attendance_shift(
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
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  old_json := to_jsonb(day);

  update public.attendance_days
  set
    confirmed_by = null,
    confirmed_at = null,
    updated_at = now()
  where id = day.id
  returning * into day;

  if me.role = 'admin' then
    insert into public.attendance_events (
      attendance_day_id, entry_id, action, performed_by, old_value, new_value
    ) values (
      day.id, null, 'shift_reopened', me.id, old_json, to_jsonb(day)
    );
  end if;

  return day;
end;
$$;

revoke all on function public.reopen_attendance_shift(date, text, text)
  from public, anon;
grant execute on function public.reopen_attendance_shift(date, text, text)
  to authenticated;
