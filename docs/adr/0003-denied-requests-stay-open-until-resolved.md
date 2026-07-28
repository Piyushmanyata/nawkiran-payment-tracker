# 3. Denied requests stay open until resolved

Date: 2026-07-28

## Status

Accepted

## Context

A **Denied Request** was treated as history: it dropped out of `/open` into the
`History` filter the moment a Director denied it, and the 30-day retention
sweep hard-deleted it from there.

That is wrong for the workflow. A denial is not the end of a payment — it is a
correction request. The Employee who raised it is the only person who can act
on it, and they were the least likely to see it, because it left the view they
actually work in. Denied requests were being forgotten, and then silently
purged.

## Decision

**`denied` is an open state for its requester, and only for its requester.**

1. **Open vs History is viewer-aware**, not status-only:
   - Open = `pending` + `approved` + `denied` **where `requested_by` is the viewer**.
   - History = `paid` + `withdrawn` + `denied` **belonging to someone else**.

   Directors and Admins have already acted on a denial, so for them it reads as
   history. Keeping it in their Open list would bury the requests that are
   genuinely blocked on them.

2. **The loop repeats.** Correcting and resubmitting a denied request returns
   it to `pending` (existing `edit_unpaid_payment` behaviour). If it is denied
   again it re-enters the requester's Open list. There is no limit on rounds.

3. **`withdrawn` is the only escape hatch.** A new terminal status, set through
   `withdraw_payment(uuid)`. Requester-only, and only from `denied`. Without it
   a request that should never be paid would sit in Open forever. It is
   deliberately *not* available to Directors: a Director who wants a request
   gone denies it and lets the requester close it, which keeps the decision to
   abandon with the person who owns the request.

4. **Retention never touches a live denial.** `purge_old_payment_history` now
   ages out only `paid` and `withdrawn` rows (plus anything an Admin has
   already soft-deleted). A denied row has no expiry.

5. **Affordance.** The viewer's own denials sort to the top of Open, carry an
   "Action needed" ribbon and a rose ring, and the `Open` filter chip shows
   their count.

The enum label lands in its own migration
(`20260728100000_payment_withdrawn_enum.sql`), because Postgres cannot use a
new enum value inside the transaction that adds it.

## Consequences

- Denied requests accumulate in an Employee's Open list until they act. That is
  the intended pressure, but it means a disengaged requester leaves visible
  debt. Admins can still soft-delete as a last resort.
- Visibility is unchanged: `withdrawn` inherits the same RLS as `denied`
  (requester + Directors + Admins), so withdrawing never widens exposure.
- `denied` rows now live indefinitely. Row growth is bounded in practice by the
  fact that resubmitting mutates the row rather than creating a new one.
- No push notification on withdraw: nobody is waiting on the outcome, and the
  Director already knows they denied it.
