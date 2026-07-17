# Setup guide

## Supabase

1. Create a Supabase project in a region close to India.
2. Apply the migrations in `supabase/migrations/` in filename order.
3. Disable public email signup.
4. Enable leaked-password protection in Authentication settings.
5. Create Auth users, then add matching rows to `public.profiles`:

```sql
insert into public.profiles (id, full_name, role, active)
values
  ('USER_UUID', 'Amit', 'employee', true),
  ('USER_UUID', 'Director Name', 'director', true),
  ('USER_UUID', 'Accounts Name', 'accounts', true);
```

Use unique temporary passwords, require a reset, and never commit credentials.

## Local app

```powershell
copy .env.local.example .env.local
# Edit .env.local with the project URL and publishable key.
npm install
npm run dev
```

Required variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

Optional (free Web Push — no third-party vendor):

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourcompany.com
```

Generate keys once with `npx web-push generate-vapid-keys`, then apply migration
`012_push_subscriptions.sql` in the Supabase SQL editor.

Never expose a service-role, VAPID private key, or other secret to the browser or
Vercel **public** env. Put `VAPID_PRIVATE_KEY` only as a server/env secret.

## Vercel

Import the private GitHub repository, set both public variables for Preview and
Production, and configure the deployed URL under Supabase Auth URL Configuration.

For push alerts, also set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
`VAPID_SUBJECT` (server secret for the private key).

## Push notifications (free)

Uses the standard **Web Push API + VAPID** only (browser push services; no paid plan).

1. Run `012_push_subscriptions.sql` in Supabase.
2. Set VAPID env vars (local + Vercel).
3. Each user taps **Enable** under the header after login.
4. **iPhone:** Share → Add to Home Screen, open the installed icon, then Enable.
5. Local testing: `npm run dev -- --experimental-https` (push needs a secure context).

| Event | Who is notified |
|---|---|
| New pending request | Directors + admins |
| Approved / auto-approved | Employees, accounts, admins |
| Denied | Requester |
| Paid | Requester |

The actor is never notified about their own action.

## Smoke test

- Employee creates a payment and sees it waiting for approval.
- Director approves or denies it in real time.
- Employee or accounts marks an approved payment paid.
- A denied requester can correct and resubmit their own payment.
- An admin can hide paid or denied history while the audit event remains.

## Backups

Export `payments` and `payment_events` weekly to the company-controlled encrypted
drive, then verify the row counts and payment IDs monthly.
