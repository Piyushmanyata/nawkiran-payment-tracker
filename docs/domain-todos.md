# Domain model: Team To-do

**Status:** Accepted after grill session (2026-07-23)  
**Product:** Nawkiran Payment Tracker  
**Scope:** Fourth bottom-nav tab — shared team to-dos (not payment-linked)

This document is the source of truth for implementing To-do. It supersedes informal chat decisions.

---

## 1. Why this exists

WhatsApp buries work in long threads. People forget what they were supposed to do.

Payments already solve that for money: **work stays visible until it is finished**, with a clear audit of who did what.

**To-do** applies the same idea to non-payment work: a shared list that stays on screen until done, with **who initiated**, **when**, and **who marked complete**.

This is **not** a second WhatsApp and **not** a full project manager. It is a **shared team checklist** with light fields (due date, priority, multi-assignee).

---

## 2. Ubiquitous language

| Term | Meaning |
|------|---------|
| **To-do** | A single shared work item on the team board. Not tied to a payment row. |
| **Open to-do** | Not yet completed. Visible in the Open section of the To-do tab. |
| **Done to-do** | Marked complete. Frozen. Visible in the Done section until retention purge. |
| **Initiator (created by)** | The staff member who created the to-do. Immutable after create. |
| **Completer (completed by)** | The staff member who marked it done. Set once; never cleared. |
| **Assignee** | Optional person(s) the work is mainly for. Filter + push aid only — does **not** gate who may complete. |
| **Mine** | Filter: to-dos **assigned to me** OR **created by me**. |
| **Priority** | `Normal` (default) or `Urgent`. |
| **Due date** | Optional calendar date when the work should be done. |
| **Overdue** | Open to-do with a due date strictly before today (local/business date rules to match payments). |

Avoid: "task", "ticket", "issue", "owner" (owner implies exclusive complete rights — we do not have that). Prefer **to-do**, **initiator**, **assignee**, **completer**.

---

## 3. Product placement

Bottom navigation becomes **four** tabs:

```text
[ Open ]   [ Add ]   [ To-do ]   [ History ]
```

| Tab | Domain |
|-----|--------|
| Open | Payment workflow (pending + outstanding) |
| Add | Create payment |
| **To-do** | Shared team to-dos (this model) |
| History | Paid/denied payments |

To-dos are a **separate aggregate** from payments. No foreign key to `payments` in v1.

---

## 4. Lifecycle

```text
        create (anyone)
              │
              ▼
           Open  ◄── edit (see permissions)
              │
              │ complete (anyone)
              ▼
           Done  (frozen — no edit, no reopen)
              │
              │ after 30 days
              ▼
         Hard-deleted (purge)
```

| Transition | Who | Rules |
|------------|-----|--------|
| Create | Any active staff | Text required; due date optional; priority default Normal; assignees optional (0..n) |
| Edit (open only) | **Initiator**, **director**, or **admin** | May change text, due date, priority, assignees |
| Complete | Any active staff | Sets completer + completed_at; status → Done |
| Reopen | **Nobody** | Done is permanent. Mistake → admin delete and/or create a new to-do |
| Delete | **Admin only** | Allowed for Open or Done (implementation: hard delete or soft-hide; prefer consistency with audit needs — see §8) |
| Purge done | System | Done rows older than **30 days** hard-deleted (same spirit as payment history retention) |
| Age out open | **Never** | Open to-dos stay until completed or admin deletes |

---

## 5. Permissions matrix

| Action | Employee | Accounts | Director | Admin |
|--------|----------|----------|----------|-------|
| View all to-dos | Yes | Yes | Yes | Yes |
| Create | Yes | Yes | Yes | Yes |
| Complete any open | Yes | Yes | Yes | Yes |
| Edit own open (initiator) | Yes | Yes | Yes | Yes |
| Edit **any** open | No | No | **Yes** | **Yes** |
| Set/change multi-assignee on open | If initiator | If initiator | **Yes (any)** | **Yes (any)** |
| Delete | No | No | No | **Yes** |
| Reopen done | No | No | No | No |

**Visibility:** everyone sees every to-do (shared board). No private to-dos in v1.

---

## 6. Fields (to-do aggregate)

| Field | Required | Notes |
|-------|----------|--------|
| `id` | yes | UUID |
| `title` / text | yes | Short description of the work (validate length; suggest 1–200 chars unless product wants longer) |
| `priority` | yes | `normal` \| `urgent`; default `normal` |
| `due_date` | no | Date only |
| `created_by` | yes | Initiator profile id; immutable |
| `created_at` | yes | Immutable |
| `completed_by` | when done | Completer profile id |
| `completed_at` | when done | |
| `status` | yes | `open` \| `done` |
| assignees | 0..n | Profile ids; optional multi-select |

**Not in v1:** link to payment, attachments, comments thread, subtasks, personal-only lists.

---

## 7. UI rules (To-do tab)

### Sections / filters

1. **Open** — default  
2. **Done** — completed items still in retention window  
3. **Mine** — assigned to me **or** created by me (open and/or done per filter UX; default apply Mine on Open)
4. **Recurring** — all recurring reminders set (including upcoming scheduled occurrences)

### Sort order (Open list)

1. **Urgent** first (then Normal)  
2. Then **earliest due date** (null due dates **last**)  
3. Then **newest created** first  

Done list: newest completed first (recommended; not grilled — implementer default).

### Card shows

- Text  
- Priority badge if Urgent  
- Due date (overdue styling when open and past due)  
- Assignees (names)  
- Initiator + created time  
- When done: completer + completed time  

### Nav badge

Open to-do **count** on the To-do tab (all open, or open in Mine — prefer **all open** so the team sees backlog; optional later: Mine-only badge).

---

## 8. Notifications

Align with existing push infrastructure where possible.

| Event | Who receives |
|-------|----------------|
| Assigned (added to assignee list on create or edit) | Each **newly** assigned person |
| Overdue reminder | Each current assignee if any; if no assignees, **initiator** (recommended default so something pings) |

**Not required day one but in scope of decision "D":** overdue reminders (cron or check-on-open). Recurring reminders for to-dos trigger at 12:00 PM (Asia/Kolkata timezone) on the scheduled due date for all assignees (or initiator if unassigned). Exact schedule (daily digest vs immediate once overdue) can be an implementation detail; product intent is **people get nudged**.

No blast-to-all on every create (rejected as too noisy).

---

## 9. Retention & deletion

| State | Retention |
|-------|-----------|
| Open | **Indefinite** until complete or admin delete |
| Done | Visible ~**30 days**, then **hard-delete** (and assignee rows / events) |

Admin delete: remove from UI immediately. Prefer hard delete for simplicity unless audit of deleted to-dos is required later (payments use soft-delete for admin history removal — to-dos may hard-delete unless legal/audit says otherwise). **Decision for implementer:** hard delete is acceptable for v1 to-dos; document if soft-delete is chosen for parity.

---

## 10. Invariants

1. A to-do is always either `open` or `done`.  
2. `created_by` / `created_at` never change.  
3. While `open`: `completed_by` and `completed_at` are null.  
4. On complete: both completer fields set in the same transaction; status becomes `done`.  
5. `done` rows are immutable (no edit text/assignees/priority/due; no reopen).  
6. Only admin may delete.  
7. Assignees do not restrict complete rights.  
8. Multi-assignee allowed; assignee list may be empty.  
9. Priority is only `normal` or `urgent`.  
10. Everyone with an active profile can read all to-dos (RLS: authenticated active staff).

---

## 11. Suggested write path (implementation sketch)

Mirror payments: **RPCs + RLS**, no direct status updates from the client.

| RPC / action | Purpose |
|--------------|---------|
| `create_todo` | Insert open to-do + assignees; push to assignees |
| `update_todo` | Edit open fields; enforce initiator \| director \| admin; diff assignees for assign push |
| `complete_todo` | Anyone active; idempotent reject if already done |
| `delete_todo` | Admin only |
| `purge_old_todos` | Delete done rows older than 30 days (call from Done view or cron) |

Realtime: optional `todos` table in publication so all phones update live (same pattern as payments).

---

## 12. Decisions log (from grill)

| # | Decision |
|---|----------|
| D1 | Fourth tab **To-do**; shared board, not payment-linked |
| D2 | Problem framing: persist work that WhatsApp loses |
| D3 | Anyone creates; anyone completes |
| D4 | Everyone sees all to-dos |
| D5 | Edit open: **initiator + director + admin** (director may edit text and assignees on **any** open to-do) |
| D6 | Admin-only delete |
| D7 | Done is **frozen** (no reopen) |
| D8 | Fields: text, optional due date, priority Normal/Urgent, **multi** optional assignees |
| D9 | Assignee = Mine filter + push; **not** exclusive ownership |
| D10 | Mine = assigned to me **or** created by me |
| D11 | Done section on same tab; **30-day** retention then purge |
| D12 | Open items **never** auto-expire |
| D13 | Sort: Urgent → earliest due (nulls last) → newest created |
| D14 | Push: on assign + overdue reminders |
| D15 | Priority labels: **Normal \| Urgent** only (default Normal) |

---

## 13. Explicit non-goals (v1)

- Linking a to-do to a payment  
- Comments / chat on a to-do  
- Private or role-restricted to-dos  
- Exclusive assignee completion  
- Reopen / uncomplete  
- Employee editing someone else’s to-do (unless they are initiator)  
- File attachments  

---

## 14. Acceptance criteria (beginner test)

1. Anjali creates “Call transporter about delivery” with no assignee → all four users see it under Open.  
2. Nawneet (director) edits that to-do, sets priority Urgent, assigns Sweeti and Anjali → both get assign push; card shows both names.  
3. Sweeti marks it done → card moves to Done; shows Sweeti + time; Anjali cannot edit it.  
4. Piyush (admin) can delete a spam open to-do.  
5. Employee cannot delete; employee who is not initiator cannot edit another person’s open to-do.  
6. After 30 days, done to-do disappears from UI/DB purge.  
7. Open to-do from months ago still visible until done or admin delete.

---

## 15. Open implementation details (non-blocking)

These were not grilled; choose the simplest option and stay consistent:

- Max title length (suggest 200)  
- Exact overdue push schedule (e.g. once per day per to-do)  
- Nav badge = all open vs Mine open  
- Admin delete hard vs soft  
- Whether assign push fires when initiator assigns themselves  

When in doubt: **same patterns as payments** (RPC, RLS, phone-sized cards, large tap targets).
