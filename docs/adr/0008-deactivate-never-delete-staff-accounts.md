# 8. "Delete a user" means deactivate; profile rows are never destroyed

Date: 2026-08-04

## Status

Accepted

## Context

The Admin dashboard needs to remove Employees and Supervisors who have left.
The obvious reading of "delete" is to destroy the row.

The schema forbids it and should. `public.profiles.id` is
`references auth.users(id) on delete restrict`, and `payments`, `payment_events`,
`todos`, `todo_threads` and now the attendance tables all carry foreign keys to
`profiles(id)`. Destroying a person either fails outright or orphans their
entire audit history — approvals, denials, payouts, confirmations. ADR-0009's
predecessor decision (`009_preserve_admin_delete_audit.sql`) already established
that this project keeps audit trails when it removes things.

## Decision

1. **Deactivation is the only removal.** `profiles.active = false`. The row, its
   name and its history survive intact, so every historical record still resolves
   to a human name.
2. **The login is closed at the same time.** The Admin API revokes the user's
   sessions and bans the auth user, so `active = false` is not merely cosmetic
   and a stale session cannot keep working.
3. **Deactivation is reversible by an Admin.** Reactivating restores both the
   profile flag and the login. There is deliberately no "restore" for payments
   (ADR-0004), but people get rehired.
4. **A deactivated person disappears from every picker** — assignee lists, push
   targets, the attendance Roster — while remaining visible on records they
   already touched.
5. **Workers are separate and follow the same principle.** A Worker who leaves is
   deactivated, not deleted, so historical Attendance Entries and past months'
   exports stay complete. A deactivated Worker still appears in an export
   covering a month he worked.
6. **The UI never says "Delete".** The affordance reads **Deactivate**, so the
   Admin is not misled about what happened.

## Consequences

- The profiles table grows monotonically. At this organisation's scale
  (single digits per year) that is irrelevant.
- Genuine erasure — a legal deletion request — is a manual database operation,
  deliberately outside the product.
- Reusing an email address for a new hire requires reactivating the old profile
  or using a different address, because `auth.users` keeps the email.
