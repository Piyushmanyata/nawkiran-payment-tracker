-- The attendance write guard is invoked by a database trigger, not by the
-- client API. Keep it unavailable as an exposed RPC function.

revoke all on function public.enforce_attendance_entry_write_rules()
  from public, anon, authenticated;
