# 13. Admins do not approve their own Payment Requests

Date: 2026-08-10

## Status

Accepted

## Context

`create_payment` auto-approved for **both** Director and Admin: the row was inserted as `approved`, stamped `approved_by = the creator`, and audited as “Auto-approved on create”. One person could therefore authorise money leaving the company with a single tap and no second pair of eyes. Admin is the superuser role — it already holds delete, to-do delete and attendance correction — so the auto-approve was never a considered grant, just inherited breadth.

Removing the auto-approve alone would have been cosmetic: an Admin's request would land in `pending` and the same Admin would still see the Approve button on it. The control only exists if the requester check exists too.

## Decision

1. **Auto-approve on create is Director-only.** An Admin's own request lands `pending` like an Employee's. Director is unchanged.
2. **Nobody approves the request they raised.** `approve_payment` raises `SELF_APPROVAL` when `requested_by = caller`. The guard is role-agnostic to match intent, but only ever bites an Admin — a Director's create never reaches `pending`.
3. **Deny is *not* restricted.** The requester may still deny their own request. Denial stops money rather than authorising it, so four-eyes does not apply.
4. **No backfill.** Rows auto-approved under the old rule keep their status and audit trail.

## Considered Options

- **Strip Admin's approval authority entirely** (`canApprove` → Director only). Rejected: it leaves Director as the single point of failure for every approval in the business.
- **Block Admin self-deny as well.** Rejected because it traps the row. `pending` cannot be withdrawn (withdraw requires `denied`) and cannot be deleted (ADR-0004 bars delete from `pending`), so an Admin who mis-typed a request would have no way to retire it without a Director. Deny → Withdraw is the escape hatch, and it is entirely in the requester's hands.
- **Revert existing auto-approved-but-unpaid rows to `pending`.** Rejected: those approvals were legitimate under the rule in force when they were made, reverting them implies a violation that did not happen, and the payout may already have been executed outside the app.

## Consequences

- `getPaymentActions` returns `showApprove` **and** `showDeny` separately — an Admin viewing their own pending request sees Deny but no Approve. Every consumer reads both.
- `canApprove` gains the optional per-row shape (`payment` + `userId`) that `canEditPayment` already uses; the role-only call still answers “may this role approve at all”.
- Admins now receive the **Similar Pending Warning** on submit (ADR-0002). Its exemption was never about seniority — it was that Director/Admin creates could not sit in `pending` and so could not be half of a duplicate pair. That is now false for Admin. The predicate is “does my create land in Pending”, not a role list.
- An Admin's create now generates a Pending push to Directors and other Admins. `list_push_targets` already excludes the actor, so the creating Admin is not notified of their own request.
- If the Director is unavailable, an Admin-raised payment cannot proceed. This is the accepted cost of the control.
