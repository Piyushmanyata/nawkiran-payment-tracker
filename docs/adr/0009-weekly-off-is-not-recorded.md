# 9. Weekly Off is not recorded as an Attendance Entry

Date: 2026-08-05

## Status

Accepted. Amends ADR-0005 §4.

## Context

ADR-0005 §4 introduced **Weekly Off** so rotating days off would not be counted
as absences ("every Sunday is blank in both workbooks for the same reason").

That argument assumed silence needed a positive counter-mark. Under an
absence-only log it does not.

The app has no roster of who was scheduled, and ADR-0005 already concedes there
is no reliable absence denominator. A rostered day off therefore needs no
representation: not recording anything is already the correct answer. Weekly
Off was machinery for a distinction the app never actually makes.

## Decision

1. **Weekly Off is removed** as an Attendance Entry kind. Kinds are only
   **Absent** and **Lent Out**.
2. **Silence means "not absent"** — it does not mean "present." A blank cell
   for a rostered day off is correct without an Entry.
3. **Lent Out stays.** It records a real business fact (a Worker spent the
   Shift at the sister Company). ADR-0005 §8 is unchanged.
4. **No replacement** — not a reason chip, not a Roster rest-day field. Putting
   `weekly_off` into absence reasons would pollute the absence count the
   Director watches.
5. **Forward migration only.** Already-applied schema/RPC migrations are not
   rewritten; a new migration narrows the check and the RPC allowlist.

## Consequences

- If a Supervisor marks someone Absent on their rostered day off out of habit,
  nothing catches it — it lands as a real absence. Accepted; the alternative is
  a scheduling feature.
- ADR-0005's body is left intact so the superseded Sunday reasoning remains
  readable; this ADR is the amendment pointer.
- `docs/handoff-attendance.md` still embeds the three-kind `create table`. Treat
  that body as historical; follow this ADR and the latest migration.
