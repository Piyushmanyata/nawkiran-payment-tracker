# 7. Admin user provisioning uses a service-role key behind three fences

Date: 2026-08-04

## Status

Accepted

## Context

Staff logins have always been created by hand in the Supabase dashboard, and
`docs/SETUP.md` explicitly told us never to introduce a service-role key. The
`security-contracts` suite even asserts that no migration provisions
`auth.users` or bakes in a password.

The Admin now needs to create Employees and Supervisors from his own dashboard.
Creating a login is an `auth.users` insert, and only the Supabase Admin API can
do that. The Admin API requires the **service-role key**, which bypasses every
RLS policy in the database — all 45 migrations of access control mean nothing to
code holding it.

Not taking the key was seriously considered: the Admin dashboard would manage
`profiles` rows only, and creating the login would stay a manual Supabase step
done a handful of times a year. It was rejected because the feature is then
half-built every time and somebody has to find the Supabase password.

## Decision

Take the key, and fence it with three constraints that cap the blast radius.

1. **Fence one — one module.** The key is read in exactly one `server-only`
   module, reached by exactly one route. It is `SUPABASE_SERVICE_ROLE_KEY`, a
   server secret, never prefixed `NEXT_PUBLIC_`, never imported into a client
   component, never passed to the browser in any form.
2. **Fence two — the caller is re-verified server-side.** The route reads the
   session from cookies, then loads that user's profile **from the database** and
   confirms `role = 'admin'`. The client's claim about its own role is never
   trusted, and no role is accepted from the request body.
3. **Fence three — creatable roles are capped.** The route can only ever create
   or assign `employee` or `supervisor`. `admin`, `director` and `accounts` are
   rejected. A compromised route cannot mint itself a Director.

Additionally:

4. **Provisioning is atomic in effect.** If the `profiles` insert fails after the
   `auth.users` insert succeeds, the orphaned auth user is deleted before
   returning an error. A login without a profile can sign in and see nothing,
   which is worse than a clean failure.
5. **Passwords are never stored, logged, or echoed.** The route generates a
   temporary password, returns it to the Admin **once** in the response for him
   to hand over, and requires a reset on first sign-in. It is never written to
   the database or to a log line.
6. **Nothing else uses the key.** Attendance, payments, to-dos and exports all
   continue to run as `authenticated` under RLS. The key's only job is user
   provisioning and deactivation.

## Consequences

- `docs/SETUP.md` must be amended: it currently forbids what this ADR
  introduces. The prohibition stands for every other key and for the browser.
- `security-contracts.test.mjs` gains assertions that the key never appears
  outside its single module and that the creatable-role cap is present.
- A leaked deployment environment is now a full-database compromise rather than
  an RLS-bounded one. This is the accepted cost, and it is the reason the key is
  a Vercel server secret rather than anything checked in.
- Creating a Director or a second Admin remains a manual Supabase task, by
  design.
