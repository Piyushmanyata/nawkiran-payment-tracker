-- One-RTT payments list with requester/approver/denier/payer names.
-- SECURITY INVOKER so RLS still applies; indexes for active sorted scans.

create index if not exists payments_active_status_requested_at_idx
  on public.payments (status, requested_at desc)
  where deleted_at is null;

create or replace function public.list_payments_ui()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'party', p.party,
        'amount', p.amount,
        'due_date', p.due_date,
        'purpose', p.purpose,
        'status', p.status,
        'requested_by', p.requested_by,
        'requested_at', p.requested_at,
        'approved_by', p.approved_by,
        'approved_at', p.approved_at,
        'denied_by', p.denied_by,
        'denied_at', p.denied_at,
        'denial_reason', p.denial_reason,
        'paid_by', p.paid_by,
        'paid_at', p.paid_at,
        'payment_mode', p.payment_mode,
        'payment_reference', p.payment_reference,
        'updated_at', p.updated_at,
        'version', p.version,
        'client_request_id', p.client_request_id,
        'requester_name', req.full_name,
        'requester_role', req.role,
        'approver_name', appr.full_name,
        'denier_name', den.full_name,
        'payer_name', pay.full_name
      )
      order by p.requested_at desc
    ),
    '[]'::jsonb
  )
  from public.payments p
  left join public.profiles req on req.id = p.requested_by
  left join public.profiles appr on appr.id = p.approved_by
  left join public.profiles den on den.id = p.denied_by
  left join public.profiles pay on pay.id = p.paid_by
  where p.deleted_at is null;
$$;

revoke all on function public.list_payments_ui() from public, anon;
grant execute on function public.list_payments_ui() to authenticated;

comment on function public.list_payments_ui() is
  'Single round-trip active payments list with actor display names for UI.';
