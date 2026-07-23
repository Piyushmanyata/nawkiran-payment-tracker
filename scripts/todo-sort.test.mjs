import assert from "node:assert/strict";
import test from "node:test";

/** Mirror of sortOpenTodos in src/lib/todos.ts — keep in sync for contract. */
function sortOpenTodos(todos) {
  return [...todos].sort((a, b) => {
    const pu = (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1);
    if (pu !== 0) return pu;
    if (a.due_date && b.due_date) {
      if (a.due_date < b.due_date) return -1;
      if (a.due_date > b.due_date) return 1;
    } else if (a.due_date && !b.due_date) return -1;
    else if (!a.due_date && b.due_date) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

test("open to-dos sort urgent, then due (nulls last), then newest", () => {
  const rows = [
    { id: "1", priority: "normal", due_date: null, created_at: "2026-07-20T10:00:00Z" },
    { id: "2", priority: "urgent", due_date: "2026-07-25", created_at: "2026-07-10T10:00:00Z" },
    { id: "3", priority: "normal", due_date: "2026-07-22", created_at: "2026-07-21T10:00:00Z" },
    { id: "4", priority: "urgent", due_date: "2026-07-21", created_at: "2026-07-01T10:00:00Z" },
    { id: "5", priority: "normal", due_date: null, created_at: "2026-07-22T10:00:00Z" },
  ];
  assert.deepEqual(
    sortOpenTodos(rows).map((r) => r.id),
    ["4", "2", "3", "5", "1"]
  );
});
