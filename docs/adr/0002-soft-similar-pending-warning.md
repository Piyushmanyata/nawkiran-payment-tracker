# 2. Soft Similar Pending Warning (no hard unique)

Date: 2026-07-24

## Status

Accepted

## Context

Employees cannot see each other's **Pending Request**s (visibility: requester + Directors/Admins only). Two Employees can therefore submit Payment Requests for the same real-world payout without knowing the other already filed. We needed a safeguard that reduces accidental doubles without fully opening Pending visibility or blocking intentional same-vendor payments.

## Decision

Adopt a **Similar Pending Warning** — soft guidance only:

1. **Who**: Employees only on create submit. Directors/Admins skip the warning (their creates often auto-approve and leave Pending immediately).
2. **When**: On submit only (not while typing).
3. **Match (Similar Pending Match)**:
   - Status = **Pending** only (not Approved, Denied, or Paid)
   - **Exact amount**
   - **Similar party** after normalize (trim, collapse spaces, case-insensitive):
     - If shorter name length ≥ 5: either normalized name **contains** the other
     - Else: normalized names must be equal
   - Includes the submitter's **own** Pending rows
4. **UX / privacy**: Generic confirm only — must not reveal the other request's party, amount, requester, or status (boolean existence signal). Example: "A similar open request may already exist — still submit?"
5. **Enforcement**: Soft only. Confirm proceeds; second Pending is allowed. No server hard-block, override token, or unique constraint for this rule. Races can still create two Pending rows.

## Consequences

### Positive
- Reduces the "other Employee doesn't know" accident without expanding Pending list visibility.
- Intentional doubles remain possible after an explicit confirm.
- Own-tab / retry doubles get the same prompt.

### Negative / Trade-offs
- Not a money lock: concurrent submits and "submit anyway" still create duplicates.
- Approved-but-unpaid same party+amount does **not** warn (Pending-only by design).
- Contains matching (≥5) can still false-positive (e.g. shared substrings in long vendor names).
- Directors never get this warning; auto-approved creates do not leave a Pending match for later Employees.
- Implementation must use a privileged/security-definer boolean check (or equivalent) so Employees learn only existence, not row details.
