# Handoff — Attendance feature (issue #13)

You are implementing GitHub issue **#13**. This document tells you exactly how.
Read it fully before your first tool call. Do not improvise around it.

---

## 0. Rules of engagement — read before anything else

1. **Read `AGENTS.md` first.** This project runs **Next.js 16.2.10**, which has
   breaking changes from what you were trained on. Before writing any Next.js
   code — routes, route handlers, server actions, `cookies()`, `after()`,
   metadata — read the relevant guide under `node_modules/next/dist/docs/`.
   Do not write Next.js code from memory. Do not guess an API.
2. **Use `lean-ctx` tools, not the native ones.** `ctx_read` instead of Read,
   `ctx_search` instead of Grep, `ctx_glob` instead of Glob, `ctx_shell`
   instead of shell, `ctx_tree` instead of `ls`. Start with `ctx_compose` to
   orient. Native Grep/Glob are blocked by policy and will fail.
3. **Use the `ponytail` skill for every coding step.** The laziest thing that
   actually works. This codebase is deliberately lean — 7 runtime dependencies,
   no UI library, no date library, no state library. Do not add one. Do not
   introduce an abstraction until the second caller exists.
4. **Use the `domain-modeling` skill** if you find yourself inventing a term
   that is not in `CONTEXT.md`. That is a signal you are about to build the
   wrong thing.
5. **Copy the house pattern; do not invent a new one.** Every question of the
   form "how should I structure this?" is answered by an existing file. This
   document names which one each time.
6. **Work phase by phase, in order.** Each phase ends with a verification
   command that must pass before you start the next. Do not batch phases.
   Do not start the UI before the database is done.
7. **Never run `git push`, never open a PR, never commit to `main`** unless the
   user explicitly asks. Create a branch and commit locally.

---

## 1. Read these first, in this order

| File | Why |
|---|---|
| `AGENTS.md` | The Next.js version warning. Non-negotiable. |
| `CONTEXT.md` → **Attendance Language** | Every term you must use. Use these words in code, in UI copy, in commit messages. |
| `docs/adr/0005-attendance-absence-only-exception-log.md` | Why there is no roll call. |
| `docs/adr/0006-attendance-shift-lock-and-supervisor-isolation.md` | The 10:00 IST rule and Supervisor isolation. |
| `docs/adr/0007-service-role-user-provisioning-fences.md` | The three fences on the service-role key. |
| `docs/adr/0008-deactivate-never-delete-staff-accounts.md` | Why "delete" means deactivate. |
| `supabase/migrations/20260731120000_delete_payment.sql` | **The RPC pattern you will copy.** |
| `supabase/migrations/003_rls.sql` | The RLS pattern you will copy. |
| `src/lib/roles.ts` | Where role predicates live, and the `Asia/Kolkata` date helper. |
| `scripts/similar-pending.test.mjs` | The test style you will copy. |
| `scripts/security-contracts.test.mjs` | The contract-test file you will extend. |

Vocabulary is not optional. If you write `labourer`, `muster`, `punch`,
`timesheet`, or `shift A` anywhere, you have used the wrong word — `CONTEXT.md`
lists the term to use and the ones to avoid.

---

## 2. The five things most likely to go wrong

Read these now so you recognise them when you get there.

1. **Presence is never recorded.** There is no "mark present" anywhere. If you
   build a present/absent toggle you have built the wrong feature. A confirmed
   Shift with zero Entries *means* everybody came.
2. **A confirmed Shift and an unconfirmed Shift are different things.** Zero
   Entries + confirmed = all present. Zero Entries + not confirmed = **Not
   submitted**. Never render them the same way. This distinction is the whole
   point of the design.
3. **The lock is computed, never stored.** No `is_locked` column. No cron job.
   No `locked_at`. Derive it from the date and the current time, every time.
4. **A Supervisor's company comes from his own profile row, server-side.**
   Never from a request parameter, never from React state, never from a URL.
   If an RPC takes a company argument, it must verify it against the caller's
   profile when the caller is a Supervisor.
5. **The service-role key touches nothing except user provisioning.** Not
   attendance, not the export, not reads. If you find yourself importing it
   anywhere other than the single provisioning module, stop.

---

## 3. Phase 1 — Supervisor role and Company

**File:** `supabase/migrations/20260804120000_supervisor_role_and_company.sql`

```sql
-- Supervisor role + Company dimension (ADR-0006).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('employee', 'director', 'accounts', 'admin', 'supervisor'));

alter table public.profiles
  add column if not exists company text;

alter table public.profiles drop constraint if exists profiles_company_check;
alter table public.profiles add constraint profiles_company_check
  check (company is null or company in ('NKPL', 'APTUS'));

-- A Supervisor without a Company can see nothing and is a bug, not a state.
alter table public.profiles drop constraint if exists profiles_supervisor_company_check;
alter table public.profiles add constraint profiles_supervisor_company_check
  check (role <> 'supervisor' or company is not null);
```

Then update `src/types/database.ts`:

- `UserRole` gains `"supervisor"`.
- Add `export type Company = "NKPL" | "APTUS";`
- `Profile` gains `company: Company | null;`

**Verify before continuing:**

```bash
npm run typecheck
```

TypeScript will now flag every `switch` and role check that does not handle
`supervisor`. **Fix each one by denying the Supervisor.** Do not widen any
existing permission. In `src/lib/roles.ts`, confirm that `canApprove`,
`canMarkPaid`, `canCreatePayment`, `canEditPayment`, `canDeletePayment`,
`canEditTodo` and `canDeleteTodo` all return `false` for `"supervisor"` —
most already will, because they are allowlists. Add an explicit test rather
than trusting the read.

---

## 4. Phase 2 — Attendance schema and RLS

**File:** `supabase/migrations/20260804120100_attendance_schema.sql`

```sql
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
```

**`lent_to_company` must differ from the Attendance Day's own company.** That
cannot be a table check because the company lives on `attendance_days`. Enforce
it in the RPC in Phase 3 and raise `LENT_TO_SAME_COMPANY`.

Then RLS, in the same file. Copy the shape from `supabase/migrations/003_rls.sql`
— read it first. For all four tables:

- `alter table … enable row level security;`
- One `for select` policy per table granting `authenticated`:
  - `public.my_role() in ('employee', 'director', 'accounts', 'admin')` → all rows
  - `public.my_role() = 'supervisor'` → only rows whose company equals the
    caller's own `profiles.company`
- **No insert / update / delete policies at all.** Every write goes through a
  `security definer` RPC. This is how payments already work.

For `attendance_entries` and `attendance_events`, which have no `company`
column, scope the Supervisor via a join to `attendance_days`.

**Verify:**

```bash
npm test
```

---

## 5. Phase 3 — The lock helper and the RPCs

**File:** `supabase/migrations/20260804120200_attendance_rpcs.sql`

Start with the lock. This is the single source of truth on the server:

```sql
-- An Attendance Day for D freezes at 10:00 IST on D+1 (ADR-0006).
create or replace function public.attendance_locked(p_work_date date)
returns boolean
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Asia/Kolkata')
       >= ((p_work_date + 1)::timestamp + time '10:00');
$$;
```

Then these RPCs. **Every one of them must follow the pattern in
`supabase/migrations/20260731120000_delete_payment.sql` exactly** — open with
`me := public.current_profile();`, check a role allowlist, raise with
`errcode = 'P0001'`, and end with
`revoke all on function … from public, anon;` +
`grant execute on function … to authenticated;`.

| RPC | Allowed roles | Must enforce |
|---|---|---|
| `upsert_attendance_entry` | `supervisor`, `admin` | Supervisor: company from his own profile only. Locked ⇒ `admin` only. Creates the Attendance Day if missing. `lent_to_company` ≠ own company. |
| `delete_attendance_entry` | `supervisor`, `admin` | Same company + lock rules. |
| `confirm_attendance_shift` | `supervisor`, `admin` | Same company + lock rules. Sets `confirmed_by` / `confirmed_at`. |
| `reopen_attendance_shift` | `supervisor`, `admin` | Same company + lock rules. Nulls `confirmed_by` / `confirmed_at`. |
| `add_worker` | `supervisor`, `admin` | Supervisor: his own company only, taken from his profile. Never accepts a company argument from a Supervisor. |
| `update_worker` | `admin` **only** | Name, designation, `active`. Never deletes. |

Error codes to raise, used consistently by name:

- `NOT_AUTHORISED` — wrong role, or a Supervisor reaching outside his company
- `NOT_FOUND` — no such row
- `LOCKED` — past the cutoff and the caller is not an Admin
- `LENT_TO_SAME_COMPANY` — `lent_to_company` equals the Attendance Day's company

**Audit rule:** when `public.attendance_locked(work_date)` is true and the
caller is an Admin, write an `attendance_events` row with the old and new values
as `jsonb`. When the day is not locked, write nothing — a Supervisor doing his
job is not a correction.

**Verify:**

```bash
npm test
```

---

## 6. Phase 4 — `src/lib/attendance.ts`, the primary test seam

This module owns **every rule that can be decided without a database**.
Components import from here and render. Components never re-implement a rule.

Export at minimum:

- `ATTENDANCE_LOCK_HOUR_IST = 10` and `ABSENCE_REASONS` — the two values most
  likely to change. One definition each, nowhere else.
- `isAttendanceLocked(workDate: string, now?: Date): boolean` — the client
  mirror of the SQL helper. **Must accept an injected `now`** so tests never
  read the wall clock. Reuse the `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" })`
  approach already in `src/lib/roles.ts` — do not add a date library.
- `canWriteAttendance(role, { company, workDate }, profile, now?)` — the whole
  permission rule in one function.
- `validateEntry(input)` — mirrors the SQL check constraints so the UI can
  block a bad submit before the round-trip.
- `summariseDay(...)` and `summariseMonth(...)` — aggregation for the Director
  view. Weekly Off excluded from absence counts; Lent Out counted separately;
  informed split from uninformed; month ranked by absence count descending with
  a stable tie-break on name.
- `buildExportRows(...)` — pure row shaping for the export, returning plain
  objects. **No file generation in this module.**

Add `Company`, `Shift`, `AttendanceKind`, `AbsenceReason`, `Worker`,
`AttendanceDay`, `AttendanceEntry` to `src/types/database.ts`, next to the
existing types.

**Test file:** `scripts/attendance.test.mjs`, in the style of
`scripts/similar-pending.test.mjs`. It must cover every case listed under
*Testing Decisions → Seam one* in issue #13. Two you must not skip:

- The lock boundary asserted at the minute either side, in both directions.
- Confirmed-with-zero-Entries vs unconfirmed-with-zero-Entries producing
  **different** results.

**Verify:**

```bash
npm test && npm run typecheck
```

---

## 7. Phase 5 — UI

**Route:** one new route, `src/app/attendance/page.tsx`, branching on role.
Supervisor → the recording page. Everybody else → the Today/Month summary.
Two components, one route. Read `src/app/todo/page.tsx` first for the page
shape, provider usage and loading conventions.

**Supervisor recording page.** Optimise for one-handed phone use at 7am:
today's date, Day / Night toggle, the current Shift's Entries, one primary
`+ Mark exception` action, and a `Confirm shift` button. The picker searches
the Roster by name and marks Workers already recorded. Reason chips, not a
text input. `Informed` is two buttons, not a checkbox.

**Summary page.** Today by default, Month tab second. Both Companies, sectioned,
each split by Shift. A Shift that is not confirmed renders as **Not submitted**
and must be visually distinct from *confirmed, nobody absent*.

**Navigation.** Add an `Attendance` tab to `src/components/AppShell.tsx`
(desktop) and `src/components/BottomNavigation.tsx` (mobile), for every role
except `supervisor`.

**Supervisor isolation** in `AppShell`: if the profile's role is `supervisor`
and the path is not the attendance route, redirect there; render no navigation
at all for that role. Mind the cold-start path — `AuthProvider` settles on the
session before the profile loads, so a Supervisor with a warm profile cache
must land on his page without an extra spinner.

**No third realtime channel.** Fetch on mount, refetch on window focus.
`payments-live` and `todos-live` stay the only channels — `CONTEXT.md` forbids
a component opening its own.

**Verify:**

```bash
npm run typecheck && npm run lint && npm run build
```

---

## 8. Phase 6 — Export

**Route handler:** `src/app/api/attendance/export/route.ts`, taking a
`YYYY-MM` month. Read `node_modules/next/dist/docs/` on route handlers before
writing it — the API differs from what you know.

- Runs **as the calling user under RLS**. It must **not** use the service-role
  key.
- Rejects `supervisor` with 403. Allows `employee`, `accounts`, `director`,
  `admin`.
- One workbook, one month, **both Companies**, one row per Attendance Entry,
  with a Company column. Columns: Company, Date, Shift, Worker, Designation,
  Kind, Informed, Reason, Note, Recorded by.
- Filename carries the month.
- Rows come from `buildExportRows` in the domain module. This handler's only
  job is rows → file → download headers.

**The one new dependency.** Add `exceljs`, pinned to an exact version with no
range prefix — every dependency in `package.json` is pinned exactly, match that.
Server-side only; it must never reach the client bundle. If you can complete the
workbook without it, do that instead and skip the dependency.

**Verify:**

```bash
npm run build
```

Then confirm the client bundle did not grow: `exceljs` must appear only in the
server output.

---

## 9. Phase 7 — Role management via Supabase

There is intentionally no in-app Admin dashboard and no service-role
provisioning route. Create Auth users and matching `public.profiles` rows in
Supabase. A Supervisor must have `role = 'supervisor'` and `company = 'NKPL'`
or `company = 'APTUS'`; staff account deactivation is also done in Supabase by
setting `active = false` and revoking access there.

---

## 10. Phase 8 — Contract tests and docs

Extend `scripts/security-contracts.test.mjs` — **extend it, do not create a
second file.** Cover every case listed under *Testing Decisions → Seam two* in
issue #13. The ones that matter most:

- No `SUPABASE_SERVICE_ROLE_KEY` appears in application source.
- There is no `/admin` dashboard or app-side staff provisioning route.
- Every attendance RPC has its role allowlist, its `LOCKED` guard, and its
  `revoke` / `grant` pair.
- Every existing payment and to-do RPC still rejects roles outside its
  allowlist, so `supervisor` gains nothing by existing.
- The pre-existing assertion that migrations never provision `auth.users` or
  bake in passwords still passes.

Update `docs/TEAM_USERS.md`: add the Supervisor row and an attendance
permissions table matching the one in `CONTEXT.md`.

---

## 11. Seed data

The Roster comes from the two workbooks on the Tally server:

- `\\Tally-server\d\Salary\JULY 26\ATTANDANCE 2026 (3).xlsx` — NKPL, 44 people
- `\\Tally-server\d\Salary\aptus\Attendance sheet Daily Basis 2026-27.xlsx` — APTUS, 32 people

Names are in column B, designations in column C, from row 4 down.

**Copy designations verbatim, including the misspellings** — `ACOUENTENT`,
`PLANT INCHAEGE`, `SEQURITY`. Matching the workbook name-for-name is what makes
the export usable. Do not correct them.

Produce a one-off seed SQL file. **Do not build an importer** — there is no
second import.

---

## 12. Definition of done

All four must pass, from the project root:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Plus, by inspection:

- No `push`, no PR, no commit to `main`. Branch and commit locally only.
- No new runtime dependency other than the export library.
- No third realtime channel.
- No `SUPABASE_SERVICE_ROLE_KEY` appears in application source.
- No `NEXT_PUBLIC_` variable added.
- Nothing in the codebase records presence.
- Every term you introduced is in `CONTEXT.md`.

## 13. If you get stuck

Stop and ask. Do not:

- widen an existing permission to make something work
- add a dependency to avoid writing ten lines
- store the lock state because computing it is awkward
- give a Supervisor a company parameter because the profile lookup is fiddly
- skip a test because the behaviour "is obviously right"

Any of those means the design has a problem worth surfacing, not routing around.
