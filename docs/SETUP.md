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

Never expose a service-role or secret key to the browser or Vercel public env.

## Vercel

Import the private GitHub repository, set both public variables for Preview and
Production, and configure the deployed URL under Supabase Auth URL Configuration.

## Smoke test

- Employee creates a payment and sees it waiting for approval.
- Director approves or denies it in real time.
- Employee or accounts marks an approved payment paid.
- A denied requester can correct and resubmit their own payment.
- An admin can hide paid or denied history while the audit event remains.

## Backups

Export `payments` and `payment_events` weekly to the company-controlled encrypted
drive, then verify the row counts and payment IDs monthly.
