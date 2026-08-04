-- Attendance hardening for projects that already ran the initial attendance
-- migrations. Keep the database boundary authoritative even for stale or
-- hand-crafted clients.

grant select on public.workers, public.attendance_days,
  public.attendance_entries, public.attendance_events to authenticated;

create or replace function public.enforce_attendance_entry_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  day public.attendance_days;
  worker public.workers;
begin
  if public.my_role() <> 'supervisor' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    select * into day
    from public.attendance_days
    where id = old.attendance_day_id;
  else
    select * into worker
    from public.workers
    where id = new.worker_id;

    if worker.id is null or not worker.active then
      raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
    end if;
    select * into day
    from public.attendance_days
    where id = new.attendance_day_id;
  end if;

  if day.id is not null and day.confirmed_at is not null then
    raise exception 'CONFIRMED' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_attendance_entry_write_rules() from public, anon;
grant execute on function public.enforce_attendance_entry_write_rules() to authenticated;

drop trigger if exists attendance_entries_write_rules
  on public.attendance_entries;
create trigger attendance_entries_write_rules
before insert or update or delete on public.attendance_entries
for each row execute function public.enforce_attendance_entry_write_rules();
