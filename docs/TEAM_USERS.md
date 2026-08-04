# Team users

Provision Directors and Admins in Supabase Authentication, then add their UUID
and role to `public.profiles` as described in [SETUP.md](SETUP.md). Never store
passwords in source control.

Day-to-day **Employee** and **Supervisor** logins are created from the Admin
page (`/admin`) using the fenced service-role path (ADR-0007).

| Name | Role |
|---|---|
| Anjali | employee |
| Sweeti | employee |
| Piyush | admin |
| Nawneet | director |
| *(plant supervisors)* | supervisor + company `NKPL` or `APTUS` |

## Payment & to-do permissions

| Action | Employee | Director | Accounts | Admin | Supervisor |
|---|---|---|---|---|---|
| Add payment | Yes | Yes, auto-approved | Yes | Yes, auto-approved | **No** |
| Approve / deny | No | Yes | No | Yes | **No** |
| Mark paid | Yes | No | Yes | Yes | **No** |
| Edit Pending / Denied | Own only | Yes (any) | Own only (legacy) | Yes (any) | **No** |
| Edit Approved (unpaid) | No | Yes | No | Yes | **No** |
| Edit Paid | No | No | No | No | **No** |
| View active history | Yes | Yes | Yes | Yes | **No** |
| Create / complete team to-do | Yes | Yes | Yes | Yes | **No** |
| Edit any open to-do | Own only (as initiator) | Yes | Own only (as initiator) | Yes | **No** |
| Delete to-do | No | No | No | Yes | **No** |

Admin removal of **payments** is a soft delete: the payment is hidden from the active UI while
the audit trail remains in the database.

Team **to-dos** are specified in [domain-todos.md](domain-todos.md) (shared board, multi-assignee, 30-day done retention).

## Attendance permissions

| Action | Supervisor | Employee | Director | Accounts | Admin |
|---|---|---|---|---|---|
| Open attendance page | Own company only | Yes (summary) | Yes (summary) | Yes (summary) | Yes (summary) |
| Record exceptions | Own company, before lock | No | No | No | Yes (any company; audit after lock) |
| Confirm / reopen shift | Own company, before lock | No | No | No | Yes |
| Add worker to roster | Own company | No | No | No | Yes (any company) |
| Rename / deactivate worker | No | No | No | No | Yes |
| Export month `.xlsx` | No | Yes | Yes | Yes | Yes |
| Create staff logins | No | No | No | No | Employee & Supervisor only |
| Deactivate staff login | No | No | No | No | Employee & Supervisor only |

See `CONTEXT.md` → **Attendance Language** and ADR-0005 through ADR-0008.
