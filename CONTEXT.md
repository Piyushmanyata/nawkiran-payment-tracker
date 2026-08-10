# Nawkiran Domain Context

Payment request workflow and role-based access boundaries for Nawkiran.

## Language

**Payment Request**:
A request submitted by staff for a vendor or party payment requiring Director authorization.
_Avoid_: Expense claim, reimbursement ticket

**Pending Request**:
A Payment Request created by anyone other than a Director — Employee, Accounts or Admin — waiting for approval. Visible only to the requester and Directors/Admins. A Director's own request is never Pending: it is Approved on creation.
_Avoid_: Open draft, unapproved claim

**Self-Approval**:
Approving the Payment Request you raised yourself. Never permitted, for any role. In practice this only constrains an Admin, since a Director's request is Approved on creation and so never awaits approval. Denying your own request is **not** Self-Approval and remains permitted — a denial stops a payment rather than authorizing one, and Deny → Withdraw is the only way a requester retires their own Pending Request.
_Avoid_: Four-eyes check, maker-checker, self-service approval

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

**Deleted Payment**:
A Payment Request that a Director or Admin has soft-removed from everyone's active lists. The row and its audit trail remain; the product never restores it. Allowed only from **Approved**, **Paid**, **Denied**, or **Withdrawn** — never from **Pending**.
_Avoid_: Hard delete, void payment, cancel status, trash, archive

**Similar Pending Match**:
A server-side similarity check used when a new Payment Request is submitted by anyone whose request lands Pending — Employee, Accounts or Admin. A match exists when another Payment Request is still **Pending** (not Approved/Denied/Paid), the **amount is exact**, and the **party names are similar** after normalize (trim, collapse spaces, case-insensitive): if the shorter name is at least 5 characters, either name may **contain** the other; otherwise names must be normalized-equal. Matches include the Employee's **own** Pending requests.
_Avoid_: Duplicate invoice lock, unique payment constraint

**Similar Pending Warning**:
A soft, generic confirm shown on submit when a Similar Pending Match exists. Copy must not reveal party, amount, requester, or status details of the other request (e.g. "A similar open request may already exist — still submit?"). Confirming proceeds; the second Pending Request is allowed. Only a Director is exempt — their request is Approved on creation and so can never be half of a duplicate pair. There is no server hard-block or override token for this case.
_Avoid_: Hard unique index, cross-employee pending list

## Rules & Notification Targets

- **Pending**: Visible to Requester + Directors + Admins. Push target: Directors + Admins.
- **Approved**: Visible to All active staff. Push target: All Employees + Requester + Admins (excluding acting Director).
- **Denied**: Visible to Requester + Directors + Admins. Push target: Requester + Admins. Counts as **open** for the requester and as **history** for everyone else.
- **Withdrawn**: Visible to Requester + Directors + Admins. No push. Always history.
- **Paid**: Visible to All active staff. Push target: Directors + Requester + Admins. Direct 1-click execution (defaults to NEFT mode).
- **Deleted**: Hidden from all staff lists (soft-hide). Push only when the removed row was **Approved** (unpaid): Employees (+ legacy accounts), excluding the actor. No push for Paid / Denied / Withdrawn deletes. No product restore.
- **Approval**: Directors and Admins approve. Nobody approves their own request (see Self-Approval) — an Admin's request needs a Director. Denying your own request stays allowed.
- **Similar Pending Warning**: Everyone except Directors; on submit only; Pending + exact amount + similar party (see Similar Pending Match). Soft confirm; doubles remain allowed. Does not apply to Approved (unpaid) or history. Privacy: boolean/generic signal only — does not widen Pending visibility.

## UI Architecture

- **Single-Page Express Hub**: Condensed primary workflow at `/open` featuring 2 top stat bars ("Pending for Approval" and "Pending for Payment"), an inline payment request drawer, Express Stepper payment cards (`1. Requested → 2. Approved → 3. Paid`), and integrated history.
- **Payment Audit Details**: Interactive detail view opened by tapping any payment card, displaying actor names (requester, approver, denier, payer), exact ISO timestamps, denial reasons, and payment modes/UTRs.
- **Responsive Affordance**: Mobile bottom sheet drawer (< 768px) and desktop slide-over side panel / split-view (≥ 768px).
- **Responsive Shell Layout**: Full-width desktop dashboard (`max-w-7xl`) with responsive multi-column layout on desktop, and single-column touch view (`max-w-lg`) with bottom navigation bar on mobile.
- **Primary Navigation**: 2 main tabs: `Payments` (`/open`) and `To-do` (`/todo`). The standalone `History` tab is removed from top and bottom navigation bars.
- **Payments Hub Filters**: Primary filter chips on `/open` are `Open` (default, displaying `pending` + `approved` + the viewer's own `denied`), `Pending`, `Approved`, and `History` (`paid` + `withdrawn` + other people's `denied`). The `Open` chip carries a count badge for the viewer's own denials, which also sort to the top of the list and render with an "Action needed" ribbon.
- **History Search**: Historical payments (`paid` / `denied`) are searchable under the `History` filter on `/open`. Searching on `Open` displays an inline notice if matching historical records exist.
- **Realtime**: One Supabase Realtime channel per dataset for the whole signed-in shell — `payments-live` (payments) and `todos-live` (todos + todo_threads) — owned by `PaymentsProvider` / `TodosProvider`. Every consumer, including the nav badge, reads from those providers; components must never open their own channel.
- **Retention & Immutability**: Settled payment records (`paid`, `withdrawn`) are retained for a rolling 30-day window (`HISTORY_KEEP_DAYS = 30`) and purged automatically. `denied` records are never auto-purged — they are still live work for their requester. Manual soft-delete (Deleted Payment) is available to **Directors and Admins only**, for `approved` / `paid` / `denied` / `withdrawn`, from the payment detail drawer with a native browser confirm — not on cards, not for Employees, not for `pending`.
- **Similar Pending Warning (submit)**: On Employee submit of a new Payment Request, if Similar Pending Match exists, show generic confirm before calling create; no live-as-you-type check.

## Attendance Language

**Company**:
One of the two businesses whose labour the app tracks — **NKPL** (Nawkiran) and
**APTUS**. Every Worker, Supervisor and Attendance Day belongs to exactly one.
_Avoid_: Site, plant, unit, branch

**Worker**:
A person on a Company's attendance Roster. Workers **never log in** — they have no
Auth user and no profile. Includes everyone on the salary workbook, not only
labourers: Operators, Accountants, Security, Cook, Cash Workers. Carries a free-text
`designation` copied from the workbook (`WORKER`, `Operator`, `SEQURITY`…).
_Avoid_: Labourer, employee, staff member, headcount

**Supervisor**:
A staff role that records attendance for exactly one Company and can reach nothing
else in the app — no payments, no to-dos, no other Company's Roster. Distinct from
the `Supervisor` designation a Worker may carry on the Roster.
_Avoid_: Foreman, incharge, manager

**Shift**:
`day` or `night`. Both Companies run both. The Night Shift of date `D` starts on the
evening of `D` and ends the following morning; it belongs to `D`.
_Avoid_: Shift A / Shift B, general shift

**Attendance Day**:
One Company + one date + one Shift. The unit that gets confirmed and locked. Holds
zero or more Attendance Entries.
_Avoid_: Attendance sheet, muster, register

**Attendance Entry**:
An absence recorded against one Worker on one Attendance Day. Carries **Informed**
(told-us, mandatory yes/no), an **Absence Reason**, and an optional note. Presence
is never recorded: a confirmed Shift with no Entries means everybody came.
Silence means "not absent", not "present" — a rostered day off needs no Entry, and
a sister-company loan needs no Entry either (ADR-0009, ADR-0010).
_Avoid_: Attendance record, mark, punch, kind, lent out

**Informed**:
Whether the Worker told anyone before not coming ("Did he tell us?"). Mandatory
yes/no on every Attendance Entry. Deliberately kept separate from the
`no_information` Absence Reason even though they overlap: answering **no** forces
that Reason, replacing whatever was picked. To record "sick, and he did not tell
us", answer no first and then pick Sick.
_Avoid_: Notified, excused, approved leave

**Absence Reason**:
A fixed chip from `sick`, `family`, `village`, `festival`, `no_information`,
`other`. Never free text; `other` requires a note. Fixed so the Director can count.
_Avoid_: Remarks, comments, cause

**Shift Confirmation**:
The record that somebody accounted for an Attendance Day. Recording an absence
confirms the Shift by itself; a Shift with no absences must be answered
— "everyone came" — because silence is the one case that leaves no evidence.
The only thing that separates *no absences* from *nobody opened the app*. An
unanswered Attendance Day reads as **Not sent**, never as full attendance.
Confirmation is not a freeze: a confirmed Shift stays editable until the
Attendance Lock (ADR-0012).
_Avoid_: Submit, save, close day, mark done, confirm (in product copy)

**Attendance Lock**:
An Attendance Day for date `D` freezes at **10:00 IST on `D + 1`**, both Shifts, one
rule. Computed from the date and the current time — never a stored flag, never a
scheduled job. Before the lock the Supervisor may open a finished Shift again and
edit freely. After it, only an Admin may write.
_Avoid_: Cutoff time, freeze flag, closed period

**Attendance Event**:
The audit row written on every Admin attendance write — actor, timestamp, previous
value — locked or not (ADR-0011). Surfaced inline in the UI as **Changes**. Mirrors
`payment_events`.
_Avoid_: Change log, revision, history entry

**Attendance Export**:
A server-generated `.xlsx` covering one month, both Companies, as a **list of
absences** — one row per Attendance Entry, never a presence grid. Feeds the
hand-kept salary workbooks; it does not replace them. Available to Employees,
Directors and Admins — never Supervisors.
_Avoid_: Muster roll, timesheet, salary sheet

## Attendance Rules & Visibility

- **Supervisor**: sees only his own Company's attendance route. Hard-redirected from
  every other path; no navigation rendered. May record absences and answer
  "everyone came" before the Lock, may add a Worker, and may read past Attendance
  Days read-only. May not reopen a Shift, deactivate Workers, export, or touch
  payments and to-dos.
- **Director**: reads every Company's attendance, including absence notes. Summary
  defaults to **Today** (per Company, per Shift, with Not-sent called out) with a
  **Month** tab sorted by absence count descending (workers with zero absences
  omitted). Stays read-only.
- **Admin**: same summary as the Director, plus inline write controls on every
  company-and-shift card (including after the Lock) and a **Workers** tab to add,
  rename, change job, deactivate, and reactivate Workers for both Companies. Every
  Admin write is audited. Provisions staff logins separately.
- **Employee / accounts**: read the summary and run the Attendance Export. No write
  access to attendance at all.
- **Push**: none. Attendance is a pull surface; the notification budget stays with
  payments.
- **Realtime**: no third channel. Attendance fetches on load and refetches on focus —
  `payments-live` and `todos-live` remain the only channels.
- **Source of truth**: the hand-kept salary workbooks, not this app (ADR-0005). Where
  they disagree, the workbook wins.

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
