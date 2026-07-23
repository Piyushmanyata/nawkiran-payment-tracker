-- Migration: 20260723222500_keep_only_open_requests.sql
-- Description: Retain past payments (paid/denied) in database for the History view (/history).
--              The /open Payments tab filters to display open requests (pending/approved),
--              while past payments are preserved in DB for history.

-- No DB purge: past payments are kept in DB for history.
select 1;
