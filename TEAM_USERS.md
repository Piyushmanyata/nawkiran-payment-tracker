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

## Nawneet (director) — one manual step

Email rate-limit blocked API signup. Create him in the dashboard:

1. Auth → Users → **Add user**
2. Email: `nawneet@nawkiran.com`
3. Password: `Nawneet@Pay1` (or your choice)
4. **Auto Confirm User**: ON
5. Copy UUID → run:

```sql
insert into public.profiles (id, full_name, role, active)
values ('PASTE_NAWNEET_UUID', 'Nawneet', 'director', true)
on conflict (id) do update
set full_name = excluded.full_name, role = excluded.role, active = true;
```

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
