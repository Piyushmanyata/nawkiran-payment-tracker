-- Advisor: profiles had identical indexes (active, role) under two names.
-- Keep the older one; drop the duplicate from 016.

drop index if exists public.profiles_role_active_idx;
