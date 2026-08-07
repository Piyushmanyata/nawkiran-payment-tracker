# 11. The Admin records and corrects attendance in place

Date: 2026-08-07

## Status

Accepted. Amends ADR-0006. See issue #16.

## Context

ADR-0006 framed Admin attendance writes as exceptional post-lock corrections. The
server already allowed Admin on every write RPC (`supervisor` and `admin`); only the
UI was missing. The Admin landed on the same read-only summary as the Director and
could not fix a wrong reason, an omitted absence, or a misspelt worker name without
a database edit.

Making Admin edits routine means the audit trail must cover every Admin write, not
only those made after the day locks. The audit trail is the safeguard — there is no
confirmation dialog on Admin corrections.

## Decision

1. **The Admin gets the Supervisor's write surface** inside the Director's two-company
   summary: add, edit, remove absences; mark a shift done; open it again — on every
   company-and-shift card, including after the lock and after the Supervisor marked
   done.
2. **The Director stays read-only.** No editing controls, no Workers tab.
3. **Every Admin write is audited**, locked or not. The four RPCs that write audit
   rows (entry upsert, entry delete, shift confirm, shift reopen) record Admin
   actions without requiring the day to be locked. Supervisor writes still produce
   no audit row.
4. **Workers tab is Admin-only** — add, rename, change job, deactivate, reactivate
   across both companies, using the existing worker RPCs.
5. **No role allowlist changes.** Director is never granted write. RPC role checks
   stay `supervisor` + `admin`.

## Consequences

- The pure attendance module owns card control booleans (`getAttendanceDayActions`);
  components render them and hold no permission rules of their own.
- ADR-0006's body is left intact so the exceptional-correction framing remains
  readable; this ADR is the amendment pointer.
