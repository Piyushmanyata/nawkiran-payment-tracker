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
A Payment Request rejected by a Director with a reason. Visible only to the requester and Directors/Admins. Push notified only to the requester and Admins. **A denial is not terminal**: the request stays in the requester's `Open` view (never History) until it is Paid or Withdrawn, so it cannot be forgotten. The requester must correct and resubmit it — which returns it to Pending, where it may be denied again, repeating the loop — or Withdraw it. For everyone other than the requester, a Denied Request reads as History.
_Avoid_: Cancelled payment, rejected ticket

**Withdrawn Request**:
A Denied Request that its own requester has retired instead of resubmitting. Terminal: no edits, no approval, no payout. Moves to History for everyone. Only the requester may withdraw, and only from `denied`.
_Avoid_: Deleted request, void payment

**Paid Request**:
An Approved Request where payout execution is completed with 1-click by an Employee or staff.
_Avoid_: Settled claim, closed transaction

**Similar Pending Match**:
A server-side similarity check used only when an Employee submits a new Payment Request. A match exists when another Payment Request is still **Pending** (not Approved/Denied/Paid), the **amount is exact**, and the **party names are similar** after normalize (trim, collapse spaces, case-insensitive): if the shorter name is at least 5 characters, either name may **contain** the other; otherwise names must be normalized-equal. Matches include the Employee's **own** Pending requests.
_Avoid_: Duplicate invoice lock, unique payment constraint

**Similar Pending Warning**:
A soft, generic confirm shown only to Employees on submit when a Similar Pending Match exists. Copy must not reveal party, amount, requester, or status details of the other request (e.g. "A similar open request may already exist — still submit?"). Confirming proceeds; the second Pending Request is allowed. Directors/Admins do not receive this warning. There is no server hard-block or override token for this case.
_Avoid_: Hard unique index, cross-employee pending list

## Rules & Notification Targets

- **Pending**: Visible to Requester + Directors + Admins. Push target: Directors + Admins.
- **Approved**: Visible to All active staff. Push target: All Employees + Requester + Admins (excluding acting Director).
- **Denied**: Visible to Requester + Directors + Admins. Push target: Requester + Admins. Counts as **open** for the requester and as **history** for everyone else.
- **Withdrawn**: Visible to Requester + Directors + Admins. No push. Always history.
- **Paid**: Visible to All active staff. Push target: Directors + Requester + Admins. Direct 1-click execution (defaults to NEFT mode).
- **Similar Pending Warning**: Employees only; on submit only; Pending + exact amount + similar party (see Similar Pending Match). Soft confirm; doubles remain allowed. Does not apply to Approved (unpaid) or history. Privacy: boolean/generic signal only — does not widen Pending visibility.

## UI Architecture

- **Single-Page Express Hub**: Condensed primary workflow at `/open` featuring 2 top stat bars ("Pending for Approval" and "Pending for Payment"), an inline payment request drawer, Express Stepper payment cards (`1. Requested → 2. Approved → 3. Paid`), and integrated history.
- **Payment Audit Details**: Interactive detail view opened by tapping any payment card, displaying actor names (requester, approver, denier, payer), exact ISO timestamps, denial reasons, and payment modes/UTRs.
- **Responsive Affordance**: Mobile bottom sheet drawer (< 768px) and desktop slide-over side panel / split-view (≥ 768px).
- **Responsive Shell Layout**: Full-width desktop dashboard (`max-w-7xl`) with responsive multi-column layout on desktop, and single-column touch view (`max-w-lg`) with bottom navigation bar on mobile.
- **Primary Navigation**: 2 main tabs: `Payments` (`/open`) and `To-do` (`/todo`). The standalone `History` tab is removed from top and bottom navigation bars.
- **Payments Hub Filters**: Primary filter chips on `/open` are `Open` (default, displaying `pending` + `approved` + the viewer's own `denied`), `Pending`, `Approved`, and `History` (`paid` + `withdrawn` + other people's `denied`). The `Open` chip carries a count badge for the viewer's own denials, which also sort to the top of the list and render with an "Action needed" ribbon.
- **History Search**: Historical payments (`paid` / `denied`) are searchable under the `History` filter on `/open`. Searching on `Open` displays an inline notice if matching historical records exist.
- **Realtime**: One Supabase Realtime channel per dataset for the whole signed-in shell — `payments-live` (payments) and `todos-live` (todos + todo_threads) — owned by `PaymentsProvider` / `TodosProvider`. Every consumer, including the nav badge, reads from those providers; components must never open their own channel.
- **Retention & Immutability**: Settled payment records (`paid`, `withdrawn`) are retained for a rolling 30-day window (`HISTORY_KEEP_DAYS = 30`) and purged automatically. `denied` records are never auto-purged — they are still live work for their requester. Manual deletion is disabled for Employees, Directors, and automated Agents, while Admins retain manual delete capability with a confirmation dialog.
- **Similar Pending Warning (submit)**: On Employee submit of a new Payment Request, if Similar Pending Match exists, show generic confirm before calling create; no live-as-you-type check.

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
