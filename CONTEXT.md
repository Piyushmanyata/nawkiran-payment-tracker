# Nawkiran Domain Context

Payment request workflow and role-based access boundaries for Nawkiran.

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
An Approved Request where payout execution is completed with 1-click by an Employee or staff.
_Avoid_: Settled claim, closed transaction

## Rules & Notification Targets

- **Pending**: Visible to Requester + Directors + Admins. Push target: Directors + Admins.
- **Approved**: Visible to All active staff. Push target: All Employees + Requester + Admins (excluding acting Director).
- **Denied**: Visible to Requester + Directors + Admins. Push target: Requester + Admins.
- **Paid**: Visible to All active staff. Push target: Directors + Requester + Admins. Direct 1-click execution (defaults to NEFT mode).

## UI Architecture

- **Single-Page Express Hub**: Condensed primary workflow at `/open` featuring 2 top stat bars ("Pending for Approval" and "Pending for Payment"), an inline payment request drawer, Express Stepper payment cards (`1. Requested → 2. Approved → 3. Paid`), and integrated history.
- **Payment Audit Details**: Interactive detail view opened by tapping any payment card, displaying actor names (requester, approver, denier, payer), exact ISO timestamps, denial reasons, and payment modes/UTRs.
- **Responsive Affordance**: Mobile bottom sheet drawer (< 768px) and desktop slide-over side panel / split-view (≥ 768px).
- **Responsive Shell Layout**: Full-width desktop dashboard (`max-w-7xl`) with responsive multi-column layout on desktop, and single-column touch view (`max-w-lg`) with bottom navigation bar on mobile.
- **Primary Navigation**: 2 main tabs: `Payments` (`/open`) and `To-do` (`/todo`). The standalone `History` tab is removed from top and bottom navigation bars.
- **Payments Hub Filters**: Primary filter chips on `/open` are `Open` (default, displaying `pending` + `approved`), `Pending`, `Approved`, and `History`.
- **History Search**: Historical payments (`paid` / `denied`) are searchable under the `History` filter on `/open`. Searching on `Open` displays an inline notice if matching historical records exist.
- **Retention & Immutability**: Historical payment records are retained for a rolling 30-day window (`HISTORY_KEEP_DAYS = 30`) and purged automatically. Manual deletion is disabled for Employees, Directors, and automated Agents, while Admins retain manual delete capability with a confirmation dialog.

## To-do & Recurrence Rules

**Recurring To-do**:
A To-do item configured with a repeating schedule interval or calendar pattern (`daily`, `weekly`, `monthly`, `yearly`, specific days of the week, or specific day of the month). 

**In-place Recurrence Reset**:
When a Recurring To-do is marked as completed (`done`), it is immediately reset in-place back to `open` with its `due_date` advanced to the next scheduled occurrence date based on its calendar recurrence pattern. No separate historical row is spawned.

**Recurrence Reference Anchor**:
When advancing `due_date` upon completion, the calculation anchors from the **previous scheduled due date** (not the completion timestamp), preserving fixed calendar cadence without schedule drift.

**Silent Recurrence Reset**:
When a Recurring To-do is marked `done`, `status` is silently reset to `open` and `due_date` is advanced without generating system audit messages in the task thread.

**Recurrence Preservation & Affordance**:
Upon reset, assignees and priority are fully preserved. Recurring tasks display a distinct repeat badge/icon (`🔁 [Schedule]`) on task cards in `/todo` for visual clarity.







