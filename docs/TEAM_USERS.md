# Team users

Provision users in Supabase Authentication, then add their UUID and role to
`public.profiles` as described in [SETUP.md](SETUP.md). Never store passwords in
source control.

| Name | Role |
|---|---|
| Anjali | employee |
| Sweeti | employee |
| Piyush | admin |
| Nawneet | director |

## Permissions

| Action | Employee | Director | Accounts | Admin |
|---|---|---|---|---|
| Add payment | Yes | Yes, auto-approved | Yes | Yes, auto-approved |
| Approve / deny | No | Yes | No | Yes |
| Mark paid | Yes | No | Yes | Yes |
| Edit Pending / Denied | Own only | Yes (any) | Own only (legacy) | Yes (any) |
| Edit Approved (unpaid) | No | Yes | No | Yes |
| Edit Paid | No | No | No | No |
| View active history | Yes | Yes | Yes | Yes |
| Create / complete team to-do | Yes | Yes | Yes | Yes |
| Edit any open to-do | Own only (as initiator) | Yes | Own only (as initiator) | Yes |
| Delete to-do | No | No | No | Yes |

Admin removal of **payments** is a soft delete: the payment is hidden from the active UI while
the audit trail remains in the database.

Team **to-dos** are specified in [domain-todos.md](domain-todos.md) (shared board, multi-assignee, 30-day done retention).
