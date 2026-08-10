-- The last CONFIRMED guard: the attendance_entries row trigger (ADR-0012 §4).
--
-- 20260809062004 dropped the guards from upsert_attendance_entry and
-- delete_attendance_entry, but enforce_attendance_entry_write_rules
-- (20260804130200) carries its own copy and fires on the row write itself.
-- Since the same RPC now stamps confirmed_at BEFORE inserting the entry, the
-- trigger saw a confirmed Shift on the very first absence and raised CONFIRMED
-- every time: no Supervisor could record any absence at all, and none could
-- remove one from a Shift that had been answered "everyone came".
--
-- The guard was correct under ADR-0006 §2 and is wrong under ADR-0012 §4 —
-- confirmation no longer freezes a Shift. The 10:00 Lock is the only thing
-- that stops a Supervisor writing, and the RPCs enforce it.
--
-- The rest of the trigger stands: a Supervisor may only write an absence
-- against a worker who exists and is active, whatever the client sends.
create or replace function public.enforce_attendance_entry_write_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  worker public.workers;
begin
  if public.my_role() <> 'supervisor' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select * into worker
  from public.workers
  where id = new.worker_id;

  if worker.id is null or not worker.active then
    raise exception 'NOT_AUTHORISED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- Trigger-only, never an exposed RPC (20260804130300).
revoke all on function public.enforce_attendance_entry_write_rules()
  from public, anon, authenticated;
