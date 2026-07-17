-- Fix Supabase linter: anon_security_definer_function_executable
-- Postgres grants EXECUTE to PUBLIC by default; that includes the anon role.
-- Keep SECURITY DEFINER (role checks live inside the RPCs) but lock API surface.

-- Client-facing payment RPCs: authenticated only
revoke all on function public.create_payment(text, numeric, uuid, date, text) from public;
revoke all on function public.create_payment(text, numeric, uuid, date, text) from anon;
grant execute on function public.create_payment(text, numeric, uuid, date, text) to authenticated;

revoke all on function public.approve_payment(uuid) from public;
revoke all on function public.approve_payment(uuid) from anon;
grant execute on function public.approve_payment(uuid) to authenticated;

revoke all on function public.deny_payment(uuid, text) from public;
revoke all on function public.deny_payment(uuid, text) from anon;
grant execute on function public.deny_payment(uuid, text) to authenticated;

revoke all on function public.mark_payment_paid(uuid, text, text) from public;
revoke all on function public.mark_payment_paid(uuid, text, text) from anon;
grant execute on function public.mark_payment_paid(uuid, text, text) to authenticated;

revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text) from public;
revoke all on function public.correct_denied_payment(uuid, text, numeric, date, text) from anon;
grant execute on function public.correct_denied_payment(uuid, text, numeric, date, text) to authenticated;

revoke all on function public.admin_delete_payment(uuid) from public;
revoke all on function public.admin_delete_payment(uuid) from anon;
grant execute on function public.admin_delete_payment(uuid) to authenticated;

-- Internal helper: used by other SECURITY DEFINER functions only — not a public RPC
revoke all on function public.current_profile() from public;
revoke all on function public.current_profile() from anon;
revoke all on function public.current_profile() from authenticated;

-- RLS helpers: authenticated needs EXECUTE for policies; anon must not
revoke all on function public.my_role() from public;
revoke all on function public.my_role() from anon;
grant execute on function public.my_role() to authenticated;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_active_user() from anon;
grant execute on function public.is_active_user() to authenticated;
