# 5. Attendance is an absence-only exception log that feeds the salary sheets

Date: 2026-08-04

## Status

Accepted

## Context

Both companies already keep monthly attendance workbooks by hand on the Tally
file server: `ATTANDANCE 2026 (3).xlsx` for **NKPL** (44 people, one sheet per
month, two columns `A`/`B` per day, `1.0` present / `0.0` absent / blank not
scheduled) and `Attendance sheet Daily Basis 2026-27.xlsx` for **APTUS**
(32 people, one column per day, `P`/`A`). Both end in a `TOTAL PRESENT` column
that feeds salary.

Neither workbook records **why** somebody was absent, or **whether they
informed** anyone. That is the only information the Director actually lacks.

Two shapes were considered. A full **roll call** (mark every Worker every shift)
would make the app the payroll source of truth — but the business decided the
hand-kept workbooks remain authoritative for wages, so a roll call would be
~76 toggles per day producing a number nobody uses. An **absence-only** log
records the exceptions and nothing else.

## Decision

1. **The app feeds, it does not replace.** The workbooks stay authoritative for
   wages. Where the app and a workbook disagree, the workbook wins. The app is a
   visibility layer over absences.
2. **Absence-only.** Presence is never recorded. The default reading of a
   confirmed Shift with no entries is "everybody came".
3. **Shift Confirmation is mandatory** and is what distinguishes "nobody was
   absent" from "the Supervisor never opened the app". An unconfirmed Shift is
   reported as missing, never as full attendance.
4. **Three Attendance Entry kinds**, so absence statistics stay clean:
   **Absent** (carries `informed` + reason), **Weekly Off**, **Lent Out**.
   Weekly Off exists because rotating offs would otherwise be logged as
   absences; every Sunday is blank in both workbooks for the same reason.
5. **Reason is a fixed chip set**, not free text: `sick`, `family`, `village`,
   `festival`, `no_information`, `other`. `other` requires a note. Free text
   produces four spellings of "sick" and nothing countable.
6. **`informed` is a mandatory yes/no on Absent** and stays a first-class field
   even though it overlaps the `no_information` reason — it is the specific
   question the Director asked for.
7. **The Roster is every person on the workbook**, not only labourers —
   Operators, Accountants, Security, Cook, Cash Workers included, each carrying
   the workbook's designation string. This keeps the app and the workbook
   name-for-name aligned and gives the Director a free filter dimension.
8. **Lent Out is logged by the Worker's own Supervisor**, never the borrowing
   one, so Supervisor isolation (ADR-0006) is never widened. A Lent Out Worker
   stays on his home Roster; the loan is an Entry, not a Roster change.

## Consequences

- The Excel export is a list of exceptions, not a grid. Whoever maintains the
  salary workbook applies them by hand; they cannot paste a column.
- Absence rates have no reliable denominator. "3 absent" is countable;
  "3 of 44" is not, because the app never learns who was scheduled.
- Adding roll call later is additive (a new Entry kind or a presence table) and
  does not invalidate stored Entries.
- A Supervisor is on his own Roster and may mark himself Absent. Accepted — the
  alternative leaves a hole on the day he genuinely does not come.
