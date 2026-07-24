# 1. In-place Reset for Recurring To-dos

Date: 2026-07-24

## Status

Accepted

## Context

When introducing recurring tasks into Nawkiran's To-do system, we evaluated how tasks should behave when completed: whether to spawn new distinct `Todo` records for each recurring cycle or reset the existing record in-place.

## Decision

We decided to use **In-place Recurrence Reset**:
- Marking a recurring to-do `done` immediately resets its `status` back to `open`.
- The `due_date` is recalculated and advanced based on the scheduled recurrence pattern (anchored from the previous scheduled due date).
- The reset occurs silently without generating automated thread messages or clearing task discussion threads.
- Assignees and priority are preserved across resets.

## Consequences

### Positive
- Prevents database inflation and orphan task accumulation.
- Keeps task threads unified across cycles without fragmenting conversations across separate task records.
- Simplifies query logic for active open to-dos.

### Negative / Trade-offs
- Individual cycle completion history (`completed_by`, `completed_at` per cycle) is not stored as historical database rows.
- Advanced metrics on past cycle completion timeliness are not tracked.
