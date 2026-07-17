# Nawkiran Payment Tracker
## Simple Implementation Plan — Vercel + Supabase

**Version:** 1.0  
**Date:** 16 July 2026  
**Goal:** Build an extremely simple, phone-first internal payment tracker that updates instantly across all users.

---

## 1. What the app will do

The app has one simple workflow:

```text
Employee adds payment
        ↓
Director approves or denies
        ↓
Approved payment stays under Outstanding
        ↓
Accounts pays it manually
        ↓
Accounts taps Mark Paid
        ↓
Payment moves to History
```

The app **will not make bank payments**. It only records what is due, who approved it, and whether it has been paid.

---

## 2. Keep the app deliberately small

### Required when adding a payment

- Party/vendor name
- Amount

### Optional

- Due date
- Purpose/note

### Automatically recorded

- Requested by
- Request date and time
- Approval status
- Approved or denied by
- Approval or denial time
- Paid by
- Payment date and time
- Payment mode
- UTR/reference number
- Complete activity history

### Removed completely

- Invoice photo upload
- PDF upload
- File storage
- Complicated dashboards
- Complex reports
- Bank integration
- Slack integration
- Tally integration
- Public signup
- Custom admin panel in version 1

This keeps the application fast, simple and economical.

---

## 3. Final phone interface

The app should have only **three bottom tabs**:

```text
[ Open ]        [ Add ]        [ History ]
```

### Open

Shows two sections:

1. **Waiting for Approval**
2. **Outstanding**

### Add

Shows a short form:

```text
Party/vendor*        [________________]
Amount*              [________________]
Due date             [ Optional        ]
Purpose/note         [ Optional        ]

              [ Submit ]
```

### History

Shows:

- Paid payments
- Denied payments
- Search by party
- Simple status filter

Do not use desktop-style tables on phones. Use large payment cards.

---

## 4. Example payment cards

### Pending approval

```text
ABC Transport                         ₹48,500

Pending approval
Due: 20 July

June freight charges

Requested by Amit

[ Approve ]            [ Deny ]
```

### Approved and outstanding

```text
WBSEDCL                              ₹3,25,000

Approved · Outstanding
Due: Overdue by 2 days

Factory electricity bill

[ Mark Paid ]
```

### No due date

```text
Machine Repair Co.                    ₹76,000

Approved · Outstanding
No due date

[ Mark Paid ]
```

A missing due date must not cause an error or show as overdue.

---

## 5. User roles

Use only four roles.

| Role | What the user can do |
|---|---|
| Employee | Add payments and see their own requests |
| Director | See all requests and approve or deny |
| Accounts | See all approved payments and mark them paid |
| Admin | See everything and manage users through Supabase |

### Important rule

Hiding a button is not sufficient security. Supabase must reject unauthorised actions even if somebody tries to call the database directly.

---

## 6. Technology

| Part | Service |
|---|---|
| Mobile web app | Next.js |
| Hosting | Vercel |
| Login | Supabase Auth |
| Database | Supabase Postgres |
| Instant updates | Supabase Realtime |
| Security | Supabase Row-Level Security |
| Source code | Private GitHub repository |

### Keep Vercel usage minimal

The browser will connect directly to Supabase using the public publishable key.

Vercel will mainly serve the web interface. This avoids unnecessary Vercel serverless functions and keeps resource usage low.

Sensitive actions will be protected by:

- Supabase login
- Row-Level Security
- PostgreSQL database functions
- Role checks inside the database

---

## 7. Free-tier strategy

### Supabase

The Supabase Free plan currently includes:

- 500 MB database
- 50,000 monthly active users
- 200 peak Realtime connections
- 2 million Realtime messages per month
- Unlimited API requests
- Two active free projects

This app stores only text and numbers, so its database usage should remain very small for normal internal company usage.

### Important Supabase Free limitations

- The project can pause after one week without activity.
- Automatic backups are not included.
- Logs have limited retention.

A company using the app regularly is unlikely to trigger inactivity pausing, but weekly exports should still be taken.

### Vercel

Vercel Hobby is free, but Vercel officially restricts Hobby to personal, non-commercial use.

Therefore:

| Stage | Plan |
|---|---|
| Development and private testing | Vercel Hobby + Supabase Free |
| Official company production | Vercel Pro + Supabase Free initially |

The app can be developed and tested at ₹0. A compliant company production deployment on Vercel requires its paid plan under Vercel's current terms.

Supabase can remain on the Free plan until reliability or backup requirements justify upgrading.

---

## 8. Database design

Create three tables only:

1. `profiles`
2. `payments`
3. `payment_events`

---

## 9. Profiles table

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  role text not null check (
    role in ('employee', 'director', 'accounts', 'admin')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
```

### Purpose

This table connects every logged-in user to:

- Their name
- Their role
- Whether their account is active

Do not delete former employees. Set `active = false`.

---

## 10. Payments table

```sql
create type public.payment_status as enum (
  'pending',
  'approved',
  'denied',
  'paid'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),

  party text not null
    check (char_length(trim(party)) between 1 and 150),

  amount numeric(14,2) not null
    check (amount > 0),

  due_date date,
  purpose text
    check (purpose is null or char_length(purpose) <= 500),

  status public.payment_status not null default 'pending',

  requested_by uuid not null references public.profiles(id),
  requested_at timestamptz not null default now(),

  approved_by uuid references public.profiles(id),
  approved_at timestamptz,

  denied_by uuid references public.profiles(id),
  denied_at timestamptz,
  denial_reason text,

  paid_by uuid references public.profiles(id),
  paid_at timestamptz,
  payment_mode text,
  payment_reference text,

  updated_at timestamptz not null default now(),
  version integer not null default 1,

  client_request_id uuid not null unique
);
```

### Why `client_request_id` is required

The phone creates this unique ID before submitting.

If an employee taps **Submit** twice or the internet reconnects, the database rejects the duplicate request.

---

## 11. Payment events table

```sql
create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  action text not null check (
    action in ('created', 'approved', 'denied', 'paid')
  ),
  performed_by uuid not null references public.profiles(id),
  old_status public.payment_status,
  new_status public.payment_status not null,
  note text,
  created_at timestamptz not null default now()
);
```

This is the permanent audit trail.

Normal users must never be able to edit or delete event records.

---

## 12. Status rules

Only allow these movements:

```text
Pending ─────→ Approved ─────→ Paid
    │
    └────────→ Denied
```

Reject all other movements.

Examples that must fail:

- Employee approving a payment
- Accounts approving a payment
- Director marking a payment paid
- Approving an already approved payment
- Marking a denied payment paid
- Changing a paid payment back to pending
- Deleting a paid payment

---

## 13. Database functions

The app must not directly update payment status fields.

Create four PostgreSQL functions:

1. `create_payment`
2. `approve_payment`
3. `deny_payment`
4. `mark_payment_paid`

Each function must:

1. Confirm that the user is logged in.
2. Confirm that the profile is active.
3. Confirm that the role is authorised.
4. Confirm that the current status is valid.
5. Update the payment.
6. Add a payment-event record.
7. Complete both steps in one database transaction.
8. Return the updated payment.

### `create_payment`

Inputs:

- Party
- Amount
- Optional due date
- Optional purpose
- Client request ID

Rules:

- Party cannot be empty.
- Amount must be greater than zero.
- Due date may be blank.
- Purpose may be blank.
- The logged-in user becomes `requested_by`.
- Initial status is `pending`.

### `approve_payment`

Rules:

- Only director or admin.
- Payment must currently be `pending`.
- Sets status to `approved`.
- Saves approving user and server time.
- Adds an `approved` event.

### `deny_payment`

Rules:

- Only director or admin.
- Payment must currently be `pending`.
- Denial reason should be required.
- Sets status to `denied`.
- Adds a `denied` event.

### `mark_payment_paid`

Inputs:

- Payment mode
- Optional UTR/reference

Rules:

- Only accounts or admin.
- Payment must currently be `approved`.
- Sets status to `paid`.
- Uses server time for payment time.
- Adds a `paid` event.

---

## 14. Row-Level Security

Enable Row-Level Security:

```sql
alter table public.profiles enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
```

### Employee policies

Employee can:

- Read their own profile
- Read payments they requested
- Create a payment through the approved database function

Employee cannot:

- Directly update payments
- Read another employee's requests
- Approve, deny or mark paid

### Director policies

Director can:

- Read all payments
- Read payment events
- Call approve and deny functions

Director cannot directly modify database rows.

### Accounts policies

Accounts can:

- Read all approved and paid payments
- Read payment events
- Call the mark-paid function

### Admin policies

Admin can:

- Read all records
- Use all approved functions
- Manage profiles through controlled administrative access

### Service-role key

Never place the Supabase service-role key in browser code.

Version 1 does not require it in the frontend.

---

## 15. Instant updates

Enable Realtime for the `payments` table:

```sql
alter publication supabase_realtime
add table public.payments;
```

The app subscribes to all payment changes:

```typescript
const channel = supabase
  .channel('payments-live')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'payments',
    },
    () => loadPayments()
  )
  .subscribe()
```

### Expected behaviour

```text
Employee submits request
        ↓
Supabase saves it
        ↓
Director's open screen updates automatically
```

```text
Director approves request
        ↓
Pending card disappears
        ↓
Outstanding card appears on all relevant phones
```

```text
Accounts marks it paid
        ↓
It disappears from Outstanding
        ↓
It appears in History everywhere
```

### Realtime fallback

Also refresh data when:

- The app opens
- The phone reconnects to the internet
- The user returns to the app
- The Realtime channel reconnects
- A database action completes

```typescript
window.addEventListener('online', loadPayments)

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadPayments()
  }
})
```

This makes the app reliable even after an iPhone sleeps or changes networks.

---

## 16. Mobile design rules

The app must be understandable without training.

### Use

- Large buttons
- Large amount text
- Short labels
- Payment cards
- Clear status badges
- One primary action per card
- Bottom navigation
- Plain English
- Confirmation messages
- Loading indicators

### Avoid

- Sidebars
- Tables on phones
- Technical language
- Multiple menus
- Hidden swipe gestures
- Long forms
- Too many colours
- Charts in version 1
- Complicated filters
- Settings screens

### Minimum button size

Every major button should be at least 48 pixels high.

### Status wording

Use these exact labels:

- `Waiting Approval`
- `Outstanding`
- `Denied`
- `Paid`
- `Overdue`

Do not show technical database status names to users.

---

## 17. Open screen rules

### Director

Show:

1. Waiting Approval
2. Outstanding

Each pending card has:

- Approve
- Deny

### Accounts

Show:

1. Outstanding

Each outstanding card has:

- Mark Paid

### Employee

Show:

1. My Requests

Employees should see the current status of payments they created.

### Overdue calculation

```text
Status is Approved
AND
Due date exists
AND
Due date is before today
```

If due date is blank, show:

```text
No due date
```

Do not treat it as overdue.

---

## 18. Add-payment form

Use only four fields.

| Field | Required |
|---|---:|
| Party/vendor | Yes |
| Amount | Yes |
| Due date | No |
| Purpose/note | No |

### Beginner-friendly behaviour

- Numeric keyboard for amount
- Date picker for due date
- Remember the user's name through login
- Disable Submit after one tap
- Show `Submitting...`
- On success, show `Sent for approval`
- Return to the Open tab
- Clear the form
- Never ask the user for status or requester name

---

## 19. Approve and deny actions

### Approve

Director taps:

```text
[ Approve ]
```

Show one small confirmation:

```text
Approve ₹48,500 for ABC Transport?

[ Cancel ]       [ Approve ]
```

No PIN is needed because the director is already logged in.

### Deny

Show:

```text
Why are you denying this payment?

[ Reason__________________ ]

[ Cancel ]       [ Deny ]
```

A reason should be required.

---

## 20. Mark-paid action

Accounts taps:

```text
[ Mark Paid ]
```

Show:

```text
Payment mode
[ NEFT ▼ ]

UTR/reference
[ Optional ]

[ Cancel ]       [ Mark Paid ]
```

Payment-mode options:

- NEFT
- RTGS
- IMPS
- UPI
- Cheque
- Cash
- Other

The UTR/reference can remain optional to keep the process fast.

---

## 21. Authentication

Use email and password initially.

### Login screen

```text
Email       [________________]
Password    [________________]

            [ Login ]
```

### Rules

- Disable public signup.
- Admin creates each user in Supabase.
- Admin adds the matching role to `profiles`.
- Use password reset through Supabase.
- Sessions should remain active on trusted company phones.
- Inactive users must be blocked through `profiles.active`.

### Version 1 user setup

Manage users directly in the Supabase dashboard.

Do not build an admin-user screen yet. This saves development time and reduces risk.

---

## 22. Project structure

```text
app/
├── login/
│   └── page.tsx
├── open/
│   └── page.tsx
├── add/
│   └── page.tsx
├── history/
│   └── page.tsx
├── layout.tsx
└── page.tsx

components/
├── BottomNavigation.tsx
├── PaymentCard.tsx
├── AddPaymentForm.tsx
├── ApproveDialog.tsx
├── DenyDialog.tsx
├── MarkPaidDialog.tsx
├── StatusBadge.tsx
├── OfflineBanner.tsx
└── LoadingButton.tsx

lib/
├── supabase.ts
├── auth.ts
├── payments.ts
└── realtime.ts

types/
└── database.ts
```

---

## 23. Vercel setup

1. Create a private GitHub repository.
2. Create the Next.js project.
3. Push the project to GitHub.
4. Import the repository into Vercel.
5. Add environment variables.
6. Deploy a Preview version.
7. Test on multiple phones.
8. Promote the tested version to Production.

### Required browser-safe environment variables

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Do not add a service-role key unless a future server-only feature requires it.

### Keep the frontend static where possible

Most app pages can be client-rendered after login. Supabase handles:

- Login
- Queries
- Database functions
- Realtime

This minimises Vercel compute usage.

---

## 24. Supabase setup order

1. Create Supabase project.
2. Set region closest to India.
3. Create database tables.
4. Create indexes.
5. Create database functions.
6. Enable RLS.
7. Create RLS policies.
8. Enable Realtime on `payments`.
9. Disable public signup.
10. Create test users.
11. Add profile roles.
12. Test each role directly.
13. Connect the Vercel app.

---

## 25. Recommended indexes

```sql
create index payments_status_idx
on public.payments(status);

create index payments_due_date_idx
on public.payments(due_date)
where due_date is not null;

create index payments_requested_by_idx
on public.payments(requested_by);

create index payments_requested_at_idx
on public.payments(requested_at desc);

create index payment_events_payment_id_idx
on public.payment_events(payment_id);
```

These keep lists fast as payment history grows.

---

## 26. Validation rules

### Party

- Required
- Trim spaces
- Maximum 150 characters

### Amount

- Required
- Greater than zero
- Maximum two decimal places
- Store as PostgreSQL numeric, not JavaScript floating point

### Due date

- Optional
- Store as date only
- Blank becomes `null`

### Purpose

- Optional
- Maximum 500 characters
- Blank becomes `null`

### Denial reason

- Required when denying
- Maximum 500 characters

### Payment reference

- Optional
- Maximum 100 characters

Validation must exist in both:

- The phone interface
- The PostgreSQL database

---

## 27. Error handling

Use simple user messages.

| Technical problem | User message |
|---|---|
| No internet | `You are offline. Reconnect and try again.` |
| Duplicate request | `This payment was already submitted.` |
| Already approved | `This payment has already been processed.` |
| Session expired | `Please log in again.` |
| Permission rejected | `You are not authorised for this action.` |
| Database unavailable | `Could not save. Please try again.` |

Never show raw database errors to normal users.

---

## 28. Loading behaviour

When a user taps an action:

1. Disable the button.
2. Change text to `Saving...`.
3. Send the request.
4. Wait for Supabase confirmation.
5. Reload the payment.
6. Show success.
7. Re-enable the button only if it failed.

Do not show a payment as approved or paid before Supabase confirms it.

---

## 29. Free-tier backup process

Supabase Free does not include automatic backups.

Use this manual process:

### Every week

- Export the `payments` table as CSV.
- Export the `payment_events` table as CSV.
- Store both in a private company Google Drive folder.

### Every month

- Export the database schema as SQL.
- Verify that the latest CSV files open correctly.

Because invoice files have been removed, there is no separate file backup.

This makes free-tier backup much simpler.

---

## 30. Testing plan

### Employee test

- Can log in
- Can add party and amount
- Can leave due date blank
- Can leave purpose blank
- Can see own request
- Cannot approve
- Cannot mark paid
- Cannot see another employee's request

### Director test

- Sees new request instantly
- Can approve pending request
- Can deny pending request
- Cannot approve twice
- Cannot mark paid

### Accounts test

- Sees approved payment instantly
- Can mark approved payment paid
- Cannot mark pending payment paid
- Cannot approve or deny

### Realtime test

Use three phones:

1. Employee submits on Phone A.
2. Request appears on Director Phone B.
3. Director approves on Phone B.
4. Outstanding appears on Accounts Phone C.
5. Accounts marks paid on Phone C.
6. History updates on Phones A and B.

No phone should need a manual refresh.

### Network test

- Submit on slow internet
- Turn Wi-Fi off and on
- Put iPhone to sleep
- Reopen from home screen
- Switch between Wi-Fi and mobile data
- Confirm that data refreshes automatically

---

## 31. Beginner acceptance test

Give the app to a person who has never seen it.

Without instructions, they should be able to:

- Add a payment in under 20 seconds
- Understand whether it is waiting, outstanding or paid
- Approve or deny in two taps
- Mark a payment paid in three taps
- Find an old paid payment

If they need training, simplify the interface further.

---

## 32. Implementation phases

### Phase 1 — Backend

- Create Supabase project
- Create three tables
- Add indexes
- Add functions
- Add RLS policies
- Enable Realtime
- Create test users

### Phase 2 — Basic app

- Build login
- Build Open
- Build Add
- Build History
- Build bottom navigation

### Phase 3 — Actions

- Add Approve
- Add Deny
- Add Mark Paid
- Add loading and error messages

### Phase 4 — Reliability

- Add Realtime subscription
- Add reconnect refresh
- Add duplicate protection
- Add offline banner
- Add session-expiry handling

### Phase 5 — Testing

- Test every role
- Test three phones
- Test weak internet
- Test duplicate tapping
- Test database permissions

### Phase 6 — Pilot

Use only:

- One employee
- One director
- One accounts person
- Test or low-risk payments

Run the pilot for one week.

### Phase 7 — Go live

- Remove demo data
- Create final users
- Take opening database export
- Share app link
- Add app to phone home screens
- Start using it for every payment request

---

## 33. Version 1 exclusions

Do not add these until the basic system is being used successfully:

- Invoice uploads
- WhatsApp notifications
- Email reminders
- Push notifications
- Tally integration
- Bank integration
- Vendor database
- Recurring payments
- Multi-company support
- Complex analytics
- Approval limits
- Multiple directors
- Editable paid records

Each additional feature increases cost, confusion and failure risk.

---

## 34. Future improvements

Add only after version 1 is stable:

1. Daily outstanding summary
2. Search by date range
3. Export to Excel
4. Multiple approval levels
5. Recurring-payment reminders
6. Tally export
7. Read-only auditor role
8. Automatic backups through a scheduled external process

---

## 35. Final recommended version

```text
Frontend:
Next.js phone-first web app on Vercel

Backend:
Supabase Auth + Postgres + Realtime

Storage:
No file storage

Required payment fields:
Party and amount only

Optional fields:
Due date and purpose

Navigation:
Open · Add · History

Production workflow:
Add → Approve/Deny → Outstanding → Mark Paid → History
```

---

## 36. Final success criteria

The app is ready when:

- It works clearly on iPhone and Android.
- Adding a payment requires only party and amount.
- Due date and purpose can be left blank.
- A request appears instantly on the director's phone.
- Approval appears instantly for accounts.
- Paid payments disappear immediately from Outstanding.
- All important actions are stored in the audit log.
- Unauthorised database actions are rejected.
- Double taps do not create duplicates.
- The app recovers after phone sleep or network changes.
- Weekly exports are being taken.
- A beginner can use it without training.

---

## 37. Cost conclusion

### Build and pilot

```text
Supabase Free        ₹0
Vercel Hobby         ₹0
Total                ₹0
```

Use this only for development and private testing.

### Official company production using Vercel

```text
Supabase Free        ₹0 initially
Vercel Pro           Paid
```

Vercel's current Hobby terms restrict it to non-commercial personal use. Therefore, a company production deployment should move to Vercel Pro, while Supabase can remain free initially.

---

## Official references checked

This plan was checked against the official:

- Supabase Pricing page
- Supabase Realtime Postgres Changes documentation
- Supabase Row-Level Security documentation
- Vercel Hobby Plan documentation

Checked on 16 July 2026.
