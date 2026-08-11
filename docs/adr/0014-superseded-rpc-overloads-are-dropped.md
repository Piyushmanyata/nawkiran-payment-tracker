# 14. Superseded RPC overloads are dropped, not left in place

Date: 2026-08-11

## Status

Accepted

## Context

Four RPCs had been re-declared with an extra parameter by a later migration
rather than replaced. Postgres kept both signatures, and PostgREST exposes every
overload at the same `/rest/v1/rpc/<name>` URL — it picks one by the argument
*names* the caller supplies, so omitting a parameter reaches the older function.

The dangerous pair was `update_todo`. The five-argument form predates ADR-0001
and carries only the generic edit check (`creator, director or admin`). The
six-argument form added the recurring-to-do rule: a Recurring To-do may be edited
by its creator or an Admin, **not** by a Director. `canEditTodo` enforces that
client-side and the client always sends `p_recurrence_rule`, so the app never hit
the old function — but any signed-in Director could call the endpoint without
that one field and edit a Recurring To-do somebody else created. The stale form
also never writes `recurrence_rule`, so the edit silently left the schedule
untouched.

`create_todo`, `list_todo_update_request_push_targets` and
`list_todo_update_reply_push_targets` had the same duplication with no
authorisation consequence.

Separately, the newer `create_todo` signature was created after migration 008
locked the RPC surface to `authenticated`, and that migration's `revoke ... from
anon` was never repeated for it, leaving a `SECURITY DEFINER` function reachable
by the `anon` role.

## Decision

1. **Drop every superseded overload.** One signature per RPC name. A guard that
   can be stepped around by omitting an argument is not a guard.
2. **Re-apply the migration-008 grant pattern** (`revoke from public, anon` +
   `grant to authenticated`) to `create_todo` and `is_todo_overdue_ist`.
3. **A new RPC signature must repeat the revoke/grant.** `create or replace` does
   not carry grants across a changed argument list.

## Considered Options

- **Add the recurring guard to the five-argument `update_todo` as well.**
  Rejected: it keeps two implementations of one rule in sync forever, and the
  stale form still cannot write `recurrence_rule`, so a caller would get a
  silently partial edit.
- **Leave the overloads and rely on the client always sending every argument.**
  Rejected: the REST endpoint is public to any signed-in user; the client is not
  the boundary.
- **`drop ... cascade`.** Rejected: a plain `drop` fails loudly if something
  still depends on the function, which is the check we want.

## Consequences

- Callers must send the full argument list. The app already does, so no client
  change was needed.
- The Supabase `anon_security_definer_function_executable` advisory is clear. The
  remaining `authenticated_security_definer_function_executable` warnings are
  by design: these RPCs are the write surface and carry their role checks
  internally (migration 008).
- The same migration wraps `auth.uid()`, `my_role()` and `is_active_user()` in
  scalar subqueries across the six `_select` policies that still called them
  per-row, and adds covering indexes for six unindexed foreign keys. Both are
  mechanical fixes to Supabase performance advisories with no rule change.
- Indexes the linter reports as unused were left alone. Non-use reflects current
  table sizes, not the access patterns the app will have as history accumulates.
