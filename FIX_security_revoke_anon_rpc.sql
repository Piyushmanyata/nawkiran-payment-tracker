-- Run in Supabase SQL Editor to clear:
--   anon_security_definer_function_executable (WARN)
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, which includes
-- the anon (not signed-in) role. These RPCs must only be callable when signed in.
-- Functions stay SECURITY DEFINER; authorization still happens inside each RPC.
--
-- Note: authenticated_security_definer_function_executable may still appear for
-- intentional app RPCs (create/approve/deny/pay/correct/delete). That is expected:
-- signed-in users are supposed to call those via /rest/v1/rpc/*.

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

-- Internal helper only (other DEFINER functions call it as owner)
revoke all on function public.current_profile() from public;
revoke all on function public.current_profile() from anon;
revoke all on function public.current_profile() from authenticated;

-- RLS helpers: keep for signed-in policy evaluation, not for anon
revoke all on function public.my_role() from public;
revoke all on function public.my_role() from anon;
grant execute on function public.my_role() to authenticated;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_active_user() from anon;
grant execute on function public.is_active_user() to authenticated;
