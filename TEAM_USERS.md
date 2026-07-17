# Team users

App: https://nawkiran-payment-tracker.vercel.app

## Ready after you run `FIX_team_roles.sql`

| Name | Role | Email (login id) | Password |
|---|---|---|---|
| Anjali | employee | `anjali@nawkiran.com` | `Anjali@Pay1` |
| Sweeti | employee | `sweeti@nawkiran.com` | `Sweeti@Pay1` |
| Piyush (you) | admin | `iipiyushsodhaniii@gmail.com` | (your password) |

Auth UUIDs (already in SQL):

- Anjali: `285d1e4d-994e-4d6d-a7f6-3340b257441e`
- Sweeti: `50dfa9c5-4528-49ef-acc2-88ed57b106dd`

## Nawneet (director)

Run `FIX_admin_delete_and_nawneet.sql` — creates Nawneet automatically.

| Name | Role | Email | Password |
|---|---|---|---|
| Nawneet | director | `nawneet@nawkiran.com` | `Nawneet@Pay1` |

## Admin delete history

Logged in as **admin**, open **History** → **Delete from history** on any paid/denied card (with confirm).

## Permissions

| Action | Employee (Anjali/Sweeti) | Director (Nawneet) | Admin |
|---|---|---|---|
| Add payment | Yes | Yes | Yes |
| Full Waiting / Outstanding / History | Yes | Yes | Yes |
| Approve / Deny | No | Yes | Yes |
| Mark Paid | Yes | No | Yes |
| Live totals | Yes | Yes | Yes |

## Required SQL once

Run entire file: `FIX_team_roles.sql` in SQL Editor.
