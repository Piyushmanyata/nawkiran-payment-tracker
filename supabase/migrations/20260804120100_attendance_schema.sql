-- Attendance: Workers, Attendance Days, Attendance Entries, audit (ADR-0005, ADR-0006).

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('NKPL', 'APTUS')),
  full_name text not null check (char_length(trim(full_name)) between 1 and 100),
  designation text check (designation is null or char_length(designation) <= 50),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workers_company_active_idx
  on public.workers (company, active, full_name);

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  company text not null check (company in ('NKPL', 'APTUS')),
  work_date date not null,
  shift text not null check (shift in ('day', 'night')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company, work_date, shift)
);

create index attendance_days_company_date_idx
  on public.attendance_days (company, work_date desc);

create table public.attendance_entries (
  id uuid primary key default gen_random_uuid(),
  attendance_day_id uuid not null
    references public.attendance_days(id) on delete cascade,
  worker_id uuid not null references public.workers(id),
  kind text not null check (kind in ('absent', 'weekly_off', 'lent_out')),
  informed boolean,
  reason text check (
    reason is null
    or reason in ('sick', 'family', 'village', 'festival', 'no_information', 'other')
  ),
  note text check (note is null or char_length(note) <= 200),
  lent_to_company text check (
    lent_to_company is null or lent_to_company in ('NKPL', 'APTUS')
  ),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (attendance_day_id, worker_id),

  -- Absent carries informed + reason; the other kinds carry neither.
  constraint attendance_entries_absent_fields_check check (
    (kind = 'absent' and informed is not null and reason is not null)
    or (kind <> 'absent' and informed is null and reason is null)
  ),

  -- 'other' is only meaningful with a note.
  constraint attendance_entries_other_note_check check (
    reason is distinct from 'other'
    or (note is not null and char_length(trim(note)) > 0)
  ),

  constraint attendance_entries_lent_check check (
    (kind = 'lent_out' and lent_to_company is not null)
    or (kind <> 'lent_out' and lent_to_company is null)
  )
);

create index attendance_entries_day_idx
  on public.attendance_entries (attendance_day_id);
create index attendance_entries_worker_idx
  on public.attendance_entries (worker_id);

-- Audit for post-lock Admin writes only (ADR-0006 §3).
create table public.attendance_events (
  id bigserial primary key,
  attendance_day_id uuid not null
    references public.attendance_days(id) on delete cascade,
  entry_id uuid,
  action text not null check (action in (
    'entry_created', 'entry_updated', 'entry_deleted',
    'shift_confirmed', 'shift_reopened'
  )),
  performed_by uuid not null references public.profiles(id),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index attendance_events_day_idx
  on public.attendance_events (attendance_day_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: SELECT only. All writes go through security definer RPCs (Phase 3).
-- Shape copied from 003_rls.sql. Supervisor scoped to own company (ADR-0006).
-- ---------------------------------------------------------------------------

alter table public.workers enable row level security;
alter table public.attendance_days enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.attendance_events enable row level security;

-- New public tables are not guaranteed to be exposed through Supabase's Data
-- API. RLS controls rows; these grants make the read surface reachable.
grant select on public.workers, public.attendance_days,
  public.attendance_entries, public.attendance_events to authenticated;

create policy workers_select
  on public.workers
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('employee', 'director', 'accounts', 'admin')
      or (
        public.my_role() = 'supervisor'
        and company = (
          select p.company from public.profiles p where p.id = auth.uid()
        )
      )
    )
  );

create policy attendance_days_select
  on public.attendance_days
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('employee', 'director', 'accounts', 'admin')
      or (
        public.my_role() = 'supervisor'
        and company = (
          select p.company from public.profiles p where p.id = auth.uid()
        )
      )
    )
  );

create policy attendance_entries_select
  on public.attendance_entries
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('employee', 'director', 'accounts', 'admin')
      or (
        public.my_role() = 'supervisor'
        and exists (
          select 1
          from public.attendance_days d
          where d.id = attendance_day_id
            and d.company = (
              select p.company from public.profiles p where p.id = auth.uid()
            )
        )
      )
    )
  );

create policy attendance_events_select
  on public.attendance_events
  for select
  to authenticated
  using (
    public.is_active_user()
    and (
      public.my_role() in ('employee', 'director', 'accounts', 'admin')
      or (
        public.my_role() = 'supervisor'
        and exists (
          select 1
          from public.attendance_days d
          where d.id = attendance_day_id
            and d.company = (
              select p.company from public.profiles p where p.id = auth.uid()
            )
        )
      )
    )
  );
