# 10. An Attendance Entry is an absence

Date: 2026-08-07

## Status

Accepted. Amends ADR-0005 §4 and §8, and ADR-0009 §3. See issue #16.

## Context

ADR-0005 introduced two Attendance Entry kinds — **Absent** and **Lent Out** — and
ADR-0009 kept Lent Out when it removed Weekly Off. Lent Out recorded that a Worker
spent the Shift at the sister Company.

In production Lent Out was used **zero times**. Every reader of an Attendance Entry
still branched on a distinction the business does not make: a check constraint, RPC
branches, TypeScript kinds, summary counters, an export column, and a recording
selector. A sister-company loan is not an absence; silence already means "not
absent", which is the correct record when a Worker works at the other Company.

Keeping a one-value kind column forces every reader to branch on nothing. A future
second kind would be an additive migration — which ADR-0005 already anticipated.

## Decision

1. **Lent Out is removed.** The kind and `lent_to_company` columns are dropped.
2. **An Attendance Entry is an absence.** It carries told-us (`informed`), a fixed
   reason, and an optional note. There is no kind field.
3. **`informed` and `reason` are not null.** Every surviving row already satisfied
   that because absences required them.
4. **No replacement** for sister-company loans — not a reason chip, not a note
   convention, not a flag. Nothing is recorded.
5. **Forward migration only.** Already-applied schema/RPC migrations are not
   rewritten; a new migration drops the columns and rewrites the upsert signature.

## Consequences

- The recording screen stops asking about kinds. The export loses kind and lent
  columns. Month summary loses the lent counter and lists only workers with absences.
- ADR-0005 and ADR-0009 bodies are left intact so the superseded reasoning remains
  readable; this ADR is the amendment pointer.
- `docs/handoff-attendance.md` still embeds the original three-kind table. Treat
  that body as historical; follow this ADR and the latest migration.
