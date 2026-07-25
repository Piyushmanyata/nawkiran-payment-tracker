# Research: edit / visibility gaps vs lock-after-approve policy

**Ticket:** [#10](https://github.com/Piyushmanyata/nawkiran-payment-tracker/issues/10)  
**Map:** [#9](https://github.com/Piyushmanyata/nawkiran-payment-tracker/issues/9)  
**Branch:** `research/payment-edit-policy-gaps`  
**Scope:** Read-only research of current codebase enforcement (UI, RPC, RLS/list, Realtime, tests, README). No product policy implementation.

**Target roles (ticket):** employee, director, admin only (legacy `accounts` still present in code/migrations).

---

## 1. Current behavior (with path citations)

### 1.1 UI edit gates — `src/lib/roles.ts`

`canEditPayment(role, payment?)`:

- **director / admin:** always `true` (role-level).
- **employee / accounts:** `true` unless `payment.requester_role === "director"`.
- Does **not** check:
  - payment **status** (pending / approved / denied / paid);
  - **ownership** (`requested_by === current user`).
- Comment documents intent: *“Employees/accounts may edit each others' — never director-requested ones.”*

`getPaymentActions(...)`:

- `showEdit` when status is **unpaid** = `pending | approved | denied` **and** `canEditPayment(role, payment)` **and** an `onEdit` handler is provided.
- **Paid** never gets `showEdit` from this helper.
- Approve / mark-paid / delete follow separate role helpers (`canApprove`, `canMarkPaid`, `canDeleteHistory`).

Wire-up:

| Surface | Path | Behavior |
|--------|------|----------|
| Open hub | `src/app/open/page.tsx` | `canEdit = canEditPayment(role)` (role only); passes `onEdit` into cards/drawer/history when role can edit |
| Cards / detail | `src/components/PaymentCard.tsx`, `PaymentDetailDrawer.tsx` | `getPaymentActions` → edit on any unpaid if role allows |
| History list | `src/components/HistoryWeekList.tsx` | Edit affordance only when `status === "denied"` **and** `canEditPayment(role, p)` |
| Edit dialog | `src/components/CorrectPaymentDialog.tsx` | No extra ownership/status checks; submits via caller |
| Client RPC | `src/lib/payments.ts` → `editUnpaidPayment` | Calls `edit_unpaid_payment`; queues push when `priorStatus === "denied"` |

**Net UI today:** any employee (non-director-requester row) can open edit for **peer** pending/denied/approved and for **own** approved. Paid is hidden in UI.

### 1.2 RPC — `edit_unpaid_payment` (latest migration wins)

| Migration | Role |
|-----------|------|
| `supabase/migrations/015_edit_unpaid_payment.sql` | Introduces RPC: staff roles may edit any unpaid; denied → resubmit pending; paid → `ALREADY_PROCESSED` |
| **`supabase/migrations/016_director_edit_guard_and_speed.sql`** | **Current definition** |

Latest (`016`) enforces:

1. Caller role ∈ `employee | director | accounts | admin`, else `NOT_AUTHORISED`.
2. Row exists and not soft-deleted, else `NOT_FOUND`.
3. `status = 'paid'` → `ALREADY_PROCESSED` (all roles).
4. If caller is `employee` or `accounts` **and** requester’s profile role is `director` → `NOT_AUTHORISED`.
5. **No** check that `requested_by = auth.uid()` (no own-only).
6. **No** special-case blocking of **approved** for employees — approved stays approved after field edit (`event_action := 'edited'`).
7. **Denied** path: clears denial/approval fields, sets status to **pending**, event `resubmitted` (matches target “correct → resubmit Pending”).

Direct client updates are blocked by RLS (no direct update/insert/delete on `payments`); mutations go through security-definer RPCs.

### 1.3 List visibility + RLS (employee pending privacy)

**Canonical privacy migration (latest for list + SELECT):**  
`supabase/migrations/20260723210600_employee_request_privacy_and_push.sql`

`list_payments_ui()` (security definer) filter:

```text
me_role in ('director', 'admin')
OR status in ('approved', 'paid')
OR requested_by = me_id
```

`payments_select` RLS (authenticated):

```text
is_active_user()
AND (
  my_role() in ('director', 'admin')
  OR status in ('approved', 'paid')
  OR requested_by = auth.uid()
)
```

`payment_events_select` mirrors payment visibility (via join to parent payment).

Earlier list RPCs (`021` invoker, `022` definer without privacy) are superseded by `20260723210600_*`.

**Fallback fetch** in `src/lib/payments.ts` (`fetchPayments`): if RPC fails, selects from `payments` with RLS — same privacy for employees.

**Implication for employees:**

| Status | Visible rows |
|--------|----------------|
| Pending | **Own only** |
| Denied | **Own only** |
| Approved | **All** |
| Paid | **All** |

Directors/admins see **all** non-deleted rows.

This **matches** the ticket visibility matrix for employee / director / admin. (Legacy `accounts` is not named in the privacy filter as elevated — they follow the non-director path, i.e. same as employee for list/RLS.)

### 1.4 Realtime baseline

| Piece | Path | Behavior |
|-------|------|----------|
| Channel | `src/lib/realtime.ts` | Channel name `payments-live`; `postgres_changes` on `public.payments` event `*` |
| Debounce | same | Full refresh after 400ms when `onRow` cannot handle |
| Visibility / online | same | Tab-visible refresh throttled 15s; online → schedule refresh |
| Provider | `src/components/PaymentsProvider.tsx` | Single app-wide subscribe; `onRow` patches INSERT/UPDATE into local state; DELETE / `deleted_at` removes; local optimistic suppress ~900ms; silent reload uses `FRESH_MS` 30s |
| Hook re-export | `src/hooks/usePaymentsLive.ts` | Re-exports provider `usePayments` |

Realtime row delivery is expected to respect **SELECT RLS** (employee does not get peer pending/denied events). Provider **does not** re-apply a client-side privacy filter on patches — correctness depends on RLS + full `list_payments_ui` reloads. Policy changes that keep SELECT RLS consistent preserve this channel design (**acceptance: existing payments channel must keep working**).

### 1.5 Security contract tests

`scripts/security-contracts.test.mjs` encodes **current** product rules, not the target lock-after-approve matrix:

- `"staff can edit unpaid payments via edit_unpaid_payment"` — asserts `015` structure (roles include accounts; paid blocked; edited/resubmitted events).
- `"employees cannot edit director-requested payments"` — asserts `016` guard + `roles.ts` director requester check.
- `"employee request privacy and push targeting migration"` — asserts privacy OR of director/admin **or** approved/paid **or** own.

No test currently asserts “employee own-only edit” or “employee cannot edit approved”.

### 1.6 README role table

`README.md` § Roles & Permissions (current docs):

| Role | Documented payment edit |
|------|-------------------------|
| employee | “edit own/**staff** unpaid requests (non-director requested)” |
| director | “edit any unpaid requests” |
| accounts | “edit staff unpaid requests” |
| admin | all actions + soft-delete |

README matches **today’s** peer-edit + unpaid-including-approved model; it does **not** describe lock-after-approve (employee no edit on approved; own-only pending/denied).

---

## 2. Gap vs target matrix

### Target (from ticket)

**Visibility**

- Employee: only **own** Pending and Denied; **all** Approved and Paid.
- Director/Admin: existing full visibility (requester + directors/admins for pending/denied; approved/paid as today).

**Edit**

| Status | Employee | Director | Admin |
|--------|----------|----------|-------|
| Pending | Own only | Any | Any |
| Denied | Own only (correct → resubmit Pending) | Any | Any |
| Approved | **No** | Yes | Yes |
| Paid | **No** (any role) | No | No |

### Comparison tables

#### Visibility

| Rule | Current | Target | Gap? | Severity |
|------|---------|--------|------|----------|
| Employee sees only own Pending | Yes (`list_payments_ui` + RLS) | Yes | **No** | — |
| Employee sees only own Denied | Yes | Yes | **No** | — |
| Employee sees all Approved / Paid | Yes | Yes | **No** | — |
| Director/Admin see all unpaid + history | Yes | Yes | **No** | — |
| Roles named employee/director/admin only | `accounts` still in edit RPC + `canEditPayment` + README | Ticket roles only | **Note** | note-only (legacy role) |

#### Edit — Employee

| Status | Current (UI + RPC) | Target | Gap? | Severity |
|--------|--------------------|--------|------|----------|
| Pending | **Any** non-director-requester unpaid (peers + own) | **Own only** | **Yes** — peer edit allowed | **blocks brief accuracy** |
| Denied | Same peer edit + resubmit-to-pending on edit | Own only + resubmit | **Yes** — peer edit; resubmit path OK | **blocks brief accuracy** |
| Approved | Editable (UI + RPC keep status approved) | **No** | **Yes** | **blocks brief accuracy** |
| Paid | Blocked UI + RPC `ALREADY_PROCESSED` | No | **No** | — |

#### Edit — Director / Admin

| Status | Current | Target | Gap? | Severity |
|--------|---------|--------|------|----------|
| Pending | Any | Any | **No** | — |
| Denied | Any + resubmit | Any | **No** | — |
| Approved | Yes | Yes | **No** | — |
| Paid | No | No | **No** | — |

#### Layer checklist (what must change for product policy)

| Layer | Owns enforcement today | Must change for target? |
|-------|------------------------|-------------------------|
| `canEditPayment` / `getPaymentActions` | UI affordances only | **Yes** — ownership + status (employee: no approved; own pending/denied) |
| `HistoryWeekList` / cards | UI | Follow new helpers; history already limited to denied |
| `edit_unpaid_payment` (`016`) | Server of record | **Yes** — employee: `requested_by = me`; employee: reject `approved`; keep paid lock; keep denied→pending |
| RLS SELECT / `list_payments_ui` | Visibility | **No** for stated visibility target (already aligned) |
| Realtime channel | Live updates | **No** structural change expected if RLS unchanged; retest after edit rules |
| `security-contracts.test.mjs` | Documents current rules | **Yes** — rewrite/add contracts for own-only + no employee edit approved |
| `README.md` role table | Docs | **Yes** — after policy ships |

---

## 3. Severity summary (for change brief #11)

| ID | Gap | Severity | Why it matters for the brief |
|----|-----|----------|------------------------------|
| G1 | Employee can edit **other employees’** Pending/Denied (UI + RPC); only director-requester is blocked | **Blocks brief accuracy** | Target is **own only**; brief must require ownership checks on **both** UI and RPC, not README soft wording |
| G2 | Employee can edit **Approved** (UI shows Edit; RPC allows and keeps approved) | **Blocks brief accuracy** | Core “lock after approve” for employees; UI-only hide would be insufficient |
| G3 | Security contracts + README encode **peer staff unpaid edit**, not lock-after-approve | **Blocks brief accuracy** (test/docs workstream) | Implementation PR that only changes RPC without updating tests/README will fail CI or leave docs wrong |
| G4 | No `requested_by` argument to `canEditPayment` today; page uses role-only `canEditPayment(role)` | **Blocks brief accuracy** | Brief must specify passing current user id (or equivalent) into action helpers |
| G5 | Legacy `accounts` still treated like employee for edit | **Note-only** | Ticket scopes employee/director/admin; decide whether accounts inherits employee target or remains legacy parity |
| G6 | Visibility already matches target | **Note-only** | Do not invent list/RLS rewrite unless product expands privacy; brief can treat visibility as **done** |
| G7 | Denied→Pending resubmit already implemented in RPC | **Note-only** | Keep behavior; only tighten **who** may invoke for denied rows |
| G8 | Paid locked for all roles already | **Note-only** | Confirm only; no new paid lock work |
| G9 | Realtime: existing `payments-live` + provider | **Note-only / acceptance** | Brief acceptance: channel still works; no new channel required if SELECT RLS unchanged |

**Primary product deltas for the brief:** G1 + G2 (+ G3/G4 as delivery constraints). Visibility and director/admin edit matrix are largely already correct.

---

## 4. Realtime baseline (what already exists)

Acceptance criterion: *existing payments channel must keep working after policy changes.*

Already in place (no product gap for “add realtime”):

1. **One channel** `payments-live` on `public.payments` (`*`), created in `subscribePayments` (`src/lib/realtime.ts`).
2. **Provider-owned lifecycle** in `PaymentsProvider` (subscribe on mount, unsubscribe on unmount); wrapped by `AppShell`.
3. **Patch-first updates** via `onRow` (INSERT/UPDATE merge with cached name/role meta; DELETE / soft-delete remove).
4. **Debounced full reload** fallback (`list_payments_ui` / RLS select) when patch is insufficient.
5. **Online + visibility** refresh hooks (visibility throttled 15s; provider `FRESH_MS` 30s for silent loads).
6. **Privacy interaction:** employee pending privacy is enforced at **SELECT / list RPC**; Realtime delivery should follow the same RLS. Edit-policy tightening (who may UPDATE via RPC) does not require a new channel.

**Research risk (note-only for brief QA):** after policy change, verify employee client list does not retain a peer pending row solely via an optimistic/local cache path; full reload path already privacy-filters. Not an edit-matrix gap.

---

## 5. Recommended brief call-outs (non-implementing)

1. **Server-first:** tighten `edit_unpaid_payment` so employees (and decide accounts) may edit only rows where `requested_by = me.id`, and may **not** edit `status = approved` (directors/admins still may). Keep paid rejection and denied→pending.
2. **UI parity:** extend `canEditPayment` / `getPaymentActions` with `userId` + status rules matching the matrix so Edit buttons never show for forbidden cases.
3. **Do not rework** `list_payments_ui` / `payments_select` for the visibility rules in this ticket — already aligned.
4. **Update** `scripts/security-contracts.test.mjs` and README role table as part of the same change set.
5. **Acceptance:** Realtime `payments-live` still delivers updates; smoke employee/director edit visibility after deploy.
6. **Out of scope for this research / for #11 brief only:** implementing the policy (ticket #11).

---

## 6. Source index

| Concern | Primary sources |
|---------|-----------------|
| UI edit rules | `src/lib/roles.ts` |
| UI surfaces | `src/app/open/page.tsx`, `PaymentCard.tsx`, `PaymentDetailDrawer.tsx`, `HistoryWeekList.tsx`, `CorrectPaymentDialog.tsx` |
| Client RPC | `src/lib/payments.ts` (`editUnpaidPayment`, `fetchPayments`) |
| Edit RPC (latest) | `supabase/migrations/016_director_edit_guard_and_speed.sql` (supersedes `015_…`) |
| List + RLS privacy | `supabase/migrations/20260723210600_employee_request_privacy_and_push.sql` |
| Realtime | `src/lib/realtime.ts`, `src/components/PaymentsProvider.tsx` |
| Contracts | `scripts/security-contracts.test.mjs` |
| Docs | `README.md` (Roles & Permissions) |
