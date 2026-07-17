-- Performance optimization: add indexes supporting active payment lists sorting and filtering.

create index if not exists payments_active_requested_at_idx
  on public.payments(requested_at desc)
  where deleted_at is null;

create index if not exists payments_active_status_idx
  on public.payments(status)
  where deleted_at is null;
