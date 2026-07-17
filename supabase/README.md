# Supabase database

The ordered migrations are the canonical schema and security source of truth.
Apply them in filename order to a new project, and apply new migrations to the
existing project before deploying application code that depends on them.

The database uses:

- Row Level Security on every exposed table.
- Authenticated-only RPCs for payment state changes.
- An immutable payment audit trail with soft deletion for admin history removal.
- Realtime publication on `public.payments`.

After a schema change, verify the project with:

1. table and RLS inspection;
2. security and performance advisors;
3. a read-only SQL smoke query for expected tables, policies, and functions.

Some advisor warnings for the client-facing `SECURITY DEFINER` RPCs are
intentional: the browser calls these RPCs, while each function enforces the
active profile and role before changing data.
