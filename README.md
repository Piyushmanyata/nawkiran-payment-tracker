# Nawkiran

Phone-first internal payment tracker and team task manager.

**Payment Workflow:** Add → Approve / Deny → Outstanding → 1-Click Mark Paid → History Audit
**Task Workflow:** Create → Assign → Update Threads → Status (Pending / In Progress / Done)

Built with **Next.js 16** (App Router), **React 19**, **Tailwind CSS**, **Supabase** (Auth, Postgres, Realtime, RLS & RPCs), and **VAPID Web Push Notifications**.

---

## Key Features

- **Express Payment Hub (`/open`)**: Single-page condensed dashboard featuring real-time stat counters (*Pending for Approval*, *Pending for Payment*), inline payment creation, Express Stepper cards (`Requested → Approved → Paid`), and 1-click payout execution.
- **Payment Audit Drawer**: Detailed modal displaying actor attribution (requester, approver, denier, payer), ISO timestamps, denial reasons, and payment details (modes/UTRs).
- **Integrated History & Automated Purge**: Searchable payment history under `/open?filter=history`. Historical records are retained for a rolling 30-day window (`HISTORY_KEEP_DAYS = 30`) and automatically hard-purged. Admins retain soft-delete capability to remove items from active UI while retaining audit logs.
- **Team To-do Hub & Update Threads (`/todo`)**: Dedicated task hub supporting priority tagging, due dates, task assignments, real-time status transitions, and nested, collapsible task update threads.
- **Native Web Push Notifications**: Zero-cost, VAPID-based push notification system for instant updates on payment approvals, payouts, task assignments, and thread comments without external paid services. Target resolution is strictly scoped to active user profiles.
- **Postgres Security & RPCs**: Row Level Security (RLS) enforced across all tables; state mutations are handled exclusively via transactional Security Definer RPCs.

---

## Quick Start

### 1. Prerequisites

- **Node.js**: `v18+` or `v20+`
- **Supabase**: Active Supabase project (AWS ap-south-1 / Mumbai recommended for low latency in India).

### 2. Database Migrations

Apply the migration scripts in sequential order from `supabase/migrations/` using the Supabase CLI or SQL Editor:

```bash
npx supabase db push
```
*Or execute files `001_schema.sql` through `20260724122200_active_profiles_push_target.sql` in order.*

### 3. User Setup

1. Create users via **Supabase Auth** (email/password). Disable public signup and enable leaked-password protection.
2. Link Auth users to internal user profiles in `public.profiles`:

```sql
insert into public.profiles (id, full_name, role, active)
values
  ('USER_UUID_1', 'Amit', 'employee', true),
  ('USER_UUID_2', 'Director Name', 'director', true),
  ('USER_UUID_3', 'Accounts Name', 'accounts', true);
```

### 4. Environment Setup

Copy `.env.local.example` to `.env.local` and populate your keys:

```bash
cp .env.local.example .env.local
```

Fill in the required variables:

```ini
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key

# Free Web Push (VAPID) — generate using: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@yourcompany.com
```

### 5. Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Roles & Permissions

| Role | Payment Access | To-do Access | Admin Features |
|---|---|---|---|
| **employee** | Add payment requests; 1-click mark approved payments as paid; edit **own** Pending/Denied only (not Approved, not peers') | Create, view, update assigned tasks and post update thread comments | - |
| **director** | Add auto-approved payments; approve or deny pending requests; edit any unpaid requests (incl. Approved) | Full task creation, assignment, status update, and thread comment access | - |
| **accounts** | Legacy: same edit limits as employee if still present | View team tasks and post thread updates | - |
| **admin** | All actions across payments; soft-delete rows from active UI while preserving audit events | Full task & thread management | Soft-delete active payments, manage historical retention, purge data |

---

## Project Structure

```text
src/
├── app/
│   ├── add/         # Payment request drawer route
│   ├── api/         # Web Push subscription & sending API endpoints
│   ├── login/       # Authentication page
│   ├── open/        # Express Payment Hub (Requests, Stepper, History)
│   ├── todo/        # Team To-do Hub & Task Update Threads
│   ├── globals.css  # Global styles & Tailwind configuration
│   └── layout.tsx   # Core layout wrapper with responsive navigation shell
├── components/      # UI components (PaymentCard, ExpressStepper, TodoThreadPanel, etc.)
├── hooks/           # Custom React hooks (usePushNotifications, usePayments, etc.)
├── lib/             # Supabase clients, RPC helpers, Web Push dispatcher, formatters
├── types/           # TypeScript interfaces and domain schemas
└── utils/           # Helper utilities
supabase/
└── migrations/      # Sequential database migrations, RLS policies, and RPC functions
public/              # Static assets, Web App Manifest, and Service Worker (`sw.js`)
scripts/             # Test suites and operational scripts
```

---

## Operational Commands

- `npm run dev`: Start Next.js development server
- `npm run build`: Build production bundle
- `npm run typecheck`: Run TypeScript static type checking
- `npm test`: Execute automated test suite (`node --test scripts/*.test.mjs`)
- `npm run lint`: Run ESLint checks

---

## Deployment (Vercel)

1. Connect repository to **Vercel**.
2. Set Environment Variables in Vercel settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
3. Deploy preview, test Web Push on mobile browsers (iOS PWA / Android Chrome), and promote to Production.

*Do **not** expose `VAPID_PRIVATE_KEY` or Supabase service-role key in public frontend environment variables.*

---

## Documentation Links

- [docs/SETUP.md](docs/SETUP.md): In-depth setup and environment configuration
- [docs/CONTEXT.md](CONTEXT.md): Domain language, notification target rules, and UI architecture
- [docs/domain-todos.md](docs/domain-todos.md): Team To-do domain model and RPC reference
- [supabase/README.md](supabase/README.md): Database architecture and migration guidelines
