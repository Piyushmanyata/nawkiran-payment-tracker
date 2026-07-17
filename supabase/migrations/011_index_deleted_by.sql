-- Cover the soft-delete actor foreign key for audit lookups and deletes.

create index if not exists payments_deleted_by_idx
  on public.payments(deleted_by)
  where deleted_by is not null;
