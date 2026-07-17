# Team users

App: https://nawkiran-payment-tracker.vercel.app

## Security action required

Passwords previously documented in this repository are compromised and must be rotated in Supabase Auth before the app is used. Never store user passwords in source control.

Create users through **Supabase Authentication → Users**, send/reset their passwords through Supabase Auth, then add the matching UUID and role to `public.profiles` as described in `SETUP.md`.

| Name | Role |
|---|---|
| Anjali | employee |
| Sweeti | employee |
| Piyush | admin |
| Nawneet | director |

## Admin remove history

Logged in as **admin**, open **History** → **Remove from history** on any paid/denied card. This hides the payment from the active UI but preserves its database audit events.

## Permissions

| Action | Employee | Director | Accounts | Admin |
|---|---|---|---|---|
| Add payment | Yes | Yes, auto-approved | Yes | Yes, auto-approved |
| Full Waiting / Outstanding / History | Yes | Yes | Yes | Yes |
| Approve / Deny | No | Yes | No | Yes |
| Mark Paid | Yes | No | Yes | Yes |
| Correct own denied payment | Yes | Yes | Yes | Yes |
| Live totals | Yes | Yes | Yes | Yes |

Admins may correct any denied payment. Other roles may correct only payments they originally requested.

Apply all ordered migrations `001` through `009`; do not use the legacy `FIX_*.sql` files for a new installation.
