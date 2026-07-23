# Nawkiran Payments Domain Context

Payment request workflow and role-based access boundaries for Nawkiran Payments.

## Language

**Payment Request**:
A request submitted by staff for a vendor or party payment requiring Director authorization.
_Avoid_: Expense claim, reimbursement ticket

**Pending Request**:
A Payment Request created by an Employee or Director waiting for Director approval. Visible only to the requester and Directors/Admins.
_Avoid_: Open draft, unapproved claim

**Approved Request**:
A Payment Request authorized by a Director. Visible and notified to all active staff/employees for payout execution.
_Avoid_: Verified payment, passed request

**Denied Request**:
A Payment Request rejected by a Director with a reason. Visible only to the requester and Directors/Admins. Push notified only to the requester and Admins.
_Avoid_: Cancelled payment, rejected ticket

**Paid Request**:
An Approved Request where payout execution is completed by an Employee or staff.
_Avoid_: Settled claim, closed transaction

## Rules & Notification Targets

- **Pending**: Visible to Requester + Directors + Admins. Push target: Directors + Admins.
- **Approved**: Visible to All active staff. Push target: All Employees + Requester + Admins (excluding acting Director).
- **Denied**: Visible to Requester + Directors + Admins. Push target: Requester + Admins.
- **Paid**: Visible to All active staff. Push target: Directors + Requester + Admins.

## UI Architecture

- **Single-Page Express Hub**: Condensed primary workflow at `/open` featuring 2 top stat bars ("Pending for Approval" and "Pending for Payment"), an inline payment request drawer, Express Stepper payment cards (`1. Requested → 2. Approved → 3. Paid`), and integrated history.
- **Payment Audit Details**: Interactive detail view opened by tapping any payment card, displaying actor names (requester, approver, denier, payer), exact ISO timestamps, denial reasons, and payment modes/UTRs.
- **Responsive Affordance**: Mobile bottom sheet drawer (< 768px) and desktop slide-over side panel / split-view (≥ 768px).
- **Responsive Shell Layout**: Full-width desktop dashboard (`max-w-7xl`) with responsive multi-column layout on desktop, and single-column touch view (`max-w-lg`) with bottom navigation bar on mobile.
- **Primary Navigation**: 2 main tabs: `Payments` (`/open`) and `To-do` (`/todo`). The standalone `History` tab is removed from top and bottom navigation bars.
- **Payments Hub Filters**: Primary filter chips on `/open` are `Open Requests` (default, displaying `pending` + `approved`), `Pending`, `Approved`, and `History`.
- **History Search**: Historical payments (`paid` / `denied`) are searchable under the `History` filter on `/open`. Searching on `Open Requests` displays an inline notice if matching historical records exist.
- **Retention & Immutability**: Historical payment records are retained for a rolling 30-day window (`HISTORY_KEEP_DAYS = 30`) and purged automatically. Manual deletion is disabled for Employees, Directors, and automated Agents, while Admins retain manual delete capability with a confirmation dialog.


