-- Denied Payment Requests stay OPEN for their requester until resolved.
-- The only way out without a payout is the requester withdrawing the request.
--
-- Postgres cannot use a new enum label in the same transaction that adds it,
-- so the label lands here and every function that references it lands in the
-- next migration.

alter type public.payment_status add value if not exists 'withdrawn';

alter table public.payment_events
  drop constraint if exists payment_events_action_check;

alter table public.payment_events
  add constraint payment_events_action_check
  check (action in (
    'created',
    'approved',
    'denied',
    'paid',
    'resubmitted',
    'edited',
    'withdrawn',
    'admin_deleted'
  ));
