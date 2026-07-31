# 4. Directors and Admins soft-delete Approved and history payments

Date: 2026-07-31

## Status

Accepted

## Context

Soft-delete existed as **admin-only history cleanup** (`paid` / `denied` / `withdrawn`). Directors had no way to remove a mistaken **Approved Request** from the shared payout queue, or to clean history themselves. A full “Cancel” status or restore flow would add product surface we do not want.

## Decision

1. **Who:** Directors and Admins share the same delete power. Employees never delete payments.
2. **What:** Soft-hide only (`deleted_at` / `deleted_by`); payment events retained. Product has **no restore**.
3. **When:** `approved` | `paid` | `denied` | `withdrawn`. **Never** `pending`.
4. **Audit:** Event action is **`deleted`** (not `admin_deleted`). RPC is **`delete_payment`**.
5. **UI:** Affordance only in the payment detail drawer; native browser confirm; no card action, no custom modal.
6. **Push:** Only when deleting **approved** (unpaid): same payout audience as approve (employees + legacy accounts), exclude the actor. Other statuses: silent (realtime remove only).

## Consequences

- Deleting **approved** immediately clears “Pending for Payment” for everyone; employees learn via push + realtime.
- Deleting a requester’s **denied** row removes their open “Action needed” work without Withdraw — intentional escape hatch for Directors/Admins, use sparingly.
- Supersedes the “Admins only” manual-delete line in earlier docs and the admin-only note in ADR-0003 consequences; Withdraw remains requester-only from denied.
