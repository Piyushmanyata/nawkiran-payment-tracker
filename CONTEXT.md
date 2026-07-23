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
An Approved Request where payout execution is completed by an Employee with mode and reference.
_Avoid_: Settled claim, closed transaction

## Rules & Notification Targets

- **Pending**: Visible to Requester + Directors + Admins. Push target: Directors + Admins.
- **Approved**: Visible to All active staff. Push target: All Employees + Requester + Admins (excluding acting Director).
- **Denied**: Visible to Requester + Directors + Admins. Push target: Requester + Admins.
- **Paid**: Visible to All active staff. Push target: Directors + Requester + Admins.
