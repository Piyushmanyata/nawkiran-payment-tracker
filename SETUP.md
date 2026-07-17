# Setup guide — Supabase + Vercel

Repo: https://github.com/Piyushmanyata/nawkiran-payment-tracker (private)

---

## A. Supabase (backend)

### 1. Create project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. **New project**
3. Name: `nawkiran-payments` (or similar)
4. Database password: save it in a password manager
5. Region: closest to India (e.g. Mumbai / Singapore if Mumbai unavailable)
6. Plan: Free is fine for pilot

### 2. Run SQL migrations

In Supabase → **SQL Editor** → New query, run **in order** (one file at a time):

1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_functions.sql`
3. `supabase/migrations/003_rls.sql`
4. `supabase/migrations/004_team_role_access.sql`
5. `supabase/migrations/005_admin_delete_and_nawneet.sql`
6. `supabase/migrations/006_auto_approve_and_simple_paid.sql`
7. `supabase/migrations/007_correct_denied_payment.sql`
8. `supabase/migrations/008_revoke_anon_rpc_execute.sql`
9. `supabase/migrations/009_preserve_admin_delete_audit.sql`

Confirm no errors after each file.

### 3. Auth settings

1. **Authentication → Providers → Email**: enabled
2. **Disable public signup** (Sign up / allow new users off)
3. **Leaked password protection**: enable under Authentication → Providers → Email (or Security) — checks against HaveIBeenPwned
4. Optional: set site URL later to your Vercel URL under Authentication → URL Configuration

Migration 008 always revokes RPC execution from PUBLIC/anon. Payment RPCs remain available to signed-in users only. `authenticated_security_definer_function_executable` on those RPCs is expected.
### 4. Create test users

For each person (employee, director, accounts):

1. **Authentication → Users → Add user**
   - Email + a unique temporary password that is never committed
   - Auto-confirm user: yes
   - Require the user to reset the temporary password
2. Copy the user **UUID**
3. **SQL Editor**:

```sql
insert into public.profiles (id, full_name, role, active)
values
  ('PASTE_UUID_EMPLOYEE', 'Amit', 'employee', true),
  ('PASTE_UUID_DIRECTOR', 'Director Name', 'director', true),
  ('PASTE_UUID_ACCOUNTS', 'Accounts Name', 'accounts', true);
```

Roles allowed: `employee` | `director` | `accounts` | `admin`

### 5. Copy API keys

**Project Settings → API**:

| Variable | Where |
|---|---|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable / anon key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

**Never** put the **service_role** key in the frontend or Vercel public env.

### 6. Local env

```powershell
copy .env.local.example .env.local
# Edit .env.local with URL + publishable key
npm run dev
```

Open http://localhost:3000 and log in with a test user.

---

## B. Vercel (hosting)

### 1. Import repo

1. Open [https://vercel.com/new](https://vercel.com/new)
2. Import **Piyushmanyata/nawkiran-payment-tracker**
3. Framework: Next.js (auto-detected)

### 2. Environment variables

Add for **Production** and **Preview**:

```text
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### 3. Deploy

Deploy → wait for green build → open the Preview URL on a phone.

### 4. Point Supabase Auth at Vercel

In Supabase → **Authentication → URL Configuration**:

- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/**`

### 5. Production note

Vercel Hobby is for non-commercial personal use. For company production, move to **Vercel Pro** when you go live.

---

## C. Smoke test checklist

| Step | Expected |
|---|---|
| Employee adds party + amount | Card under Waiting for Approval |
| Director Open tab | Waiting for Approval updates (no refresh) |
| Director Approve | Moves to Outstanding |
| Employee/accounts Mark Paid | Leaves Outstanding; appears in History |
| Deny with reason | Appears in History as Denied |
| Double-tap Submit | Second attempt: already submitted / no duplicate |
| Airplane mode toggle | Offline banner; reconnect reloads |

### Backups

The admin owns a weekly CSV export of `payments` and `payment_events` to the company-controlled encrypted drive. Once per month, open both exports and verify row counts and payment IDs match. Record the export date and reviewer in the drive folder; Supabase Free backups are not a substitute for this check.

---

## D. CLI shortcuts (optional)

### Push already done

```text
git remote: origin → https://github.com/Piyushmanyata/nawkiran-payment-tracker.git
branch: main
```

### Vercel CLI (after web import or login)

```powershell
npx vercel login
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx vercel --prod
```
