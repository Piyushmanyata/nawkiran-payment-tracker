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
| Edit unpaid (pending/approved/denied) | Other staff (not director) | Yes (incl. own) | Other staff (not director) | Yes |
| Edit director-requested payments | No | Yes | No | Yes |
| View active history | Yes | Yes | Yes | Yes |

Admin removal is a soft delete: the payment is hidden from the active UI while
the audit trail remains in the database.
