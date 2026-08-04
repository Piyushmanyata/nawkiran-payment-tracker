# 6. Attendance locks at 10:00 IST the next day; Supervisors are isolated to one company

Date: 2026-08-04

## Status

Accepted

## Context

The Supervisor must be able to fix his own mistakes, but an attendance record
that stays editable forever is worthless as evidence. The requirement was
"after the day is over it is locked — only the admin can edit after that".

"The day is over" is ambiguous because the Night Shift crosses midnight: the
Night Shift of 3 August starts on the evening of the 3rd and ends around 06:00
on the 4th. Locking at midnight would lock the Supervisor out before his shift
had ended.

Separately, the Supervisor is a new role that must see nothing but his own
attendance page — no payments, no to-dos, no other company's Roster.

## Decision

1. **One cutoff, not two.** Every Attendance Day for date `D` — both Shifts —
   locks at **10:00 IST on `D + 1`**. One rule, one number, explainable as
   "you can fix yesterday until 10am". Per-shift cutoffs were rejected as two
   rules that still lock out a Supervisor finishing at 23:00.
2. **Confirm is not lock.** A confirmed Shift becomes read-only with a reopen
   affordance, so nothing changes by accident, but the Supervisor may reopen and
   re-confirm freely until the cutoff.
3. **After the cutoff, Admin only.** Not Director, not the Supervisor. Every
   post-lock write records an `attendance_events` row naming the actor, the
   timestamp and the previous value, and the UI shows it inline
   ("edited by Piyush, 12 Aug").
4. **A missed Shift stays missed.** If a Shift is never confirmed before the
   cutoff, the Supervisor gets no grace period — only an Admin can fill it in.
   It is reported as **Not submitted** in the Director's Today view until
   somebody does.
5. **The lock is computed, not stored.** No scheduled job flips a flag; lock
   state is derived from the Attendance Day's date and the current time in
   `Asia/Kolkata`. Both the client (`src/lib/attendance.ts`) and the RPCs
   evaluate the same rule; the server's evaluation is authoritative.
6. **A Supervisor belongs to exactly one Company**, stored on his profile. His
   Roster query is scoped by his own profile's company server-side; there is no
   company switcher and no request parameter that can widen it.
7. **Supervisors are hard-redirected** to the attendance route from any other
   path, and their shell renders no navigation. This is cosmetic defence only —
   the real boundary is that every payment and to-do RPC already rejects roles
   outside its allowlist, so `supervisor` is refused by default, plus RLS on the
   attendance tables.
8. **Supervisors may read past Attendance Days**, frozen after the cutoff, so
   "did I mark him last Tuesday?" does not become an Admin phone call.

## Consequences

- The editable window is up to 34 hours for an early Day Shift. Accepted as the
  price of one rule that the Night Shift can live with.
- All lock logic is timezone-sensitive. `Asia/Kolkata` is hardcoded, matching the
  existing `todayLocalIso` helper in `src/lib/roles.ts`. Tests must pass an
  explicit reference time rather than reading the wall clock.
- Admins inherit an ongoing correction workload. This is intentional: it makes
  post-hoc edits visible and rare.
- Adding a second Supervisor for a company is supported (both scope to the same
  company); adding one Supervisor across two companies is not, and would need
  a join table.
