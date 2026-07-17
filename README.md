# Nawkiran Payment Tracker

Phone-first internal payment tracker.

**Workflow:** Add → Approve/Deny → Outstanding → Mark Paid → History

Stack: **Next.js** (Vercel) + **Supabase** (Auth, Postgres, Realtime, RLS).

## Quick start

1. Create a Supabase project (region closest to India).
2. In the SQL editor, run migrations in order under `supabase/migrations/` (001–009).
3. Disable public signup (Auth → Providers → Email → turn off signups).
4. Create users in Supabase Auth, then insert matching rows in `profiles`:

```sql
insert into public.profiles (id, full_name, role, active)
values
  ('USER_UUID', 'Amit', 'employee', true),
  ('USER_UUID', 'Director Name', 'director', true),
  ('USER_UUID', 'Accounts Name', 'accounts', true);
```

5. Copy env file and fill keys:

```bash
cp .env.local.example .env.local
```

6. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Roles

| Role | Can do |
|---|---|
| employee | Add payments; see the team list; mark approved payments paid; correct own denied requests |
| director | Add auto-approved payments; approve / deny pending requests |
| accounts | Add payments; see the team list; mark approved payments paid; correct own denied requests |
| admin | All actions; correct any denied request; remove history from the active UI |

Admin removal is a soft delete: the payment disappears from the active UI while its event trail remains in the database.

Security is enforced by **Row Level Security** and **Postgres RPCs**. The browser never updates payment status rows directly.

## Deploy (Vercel)

1. Push to a private GitHub repo.
2. Import into Vercel.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Deploy Preview, test on phones, then promote to Production.

Do **not** put the Supabase service-role key in the frontend or Vercel public env.

## Project layout

```text
src/app/          login, open, add, history routes
src/components/   UI (cards, dialogs, nav)
src/lib/          supabase, payments RPCs, realtime, format
supabase/migrations/  schema, functions, RLS
```

## Plan

See `nawkiran-payment-tracker-implementation-plan.md` for the original v1 plan and its prominent current-product override note.
