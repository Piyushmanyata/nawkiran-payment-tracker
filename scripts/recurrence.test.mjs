import assert from "node:assert/strict";
import test from "node:test";
import { calculateNextDueDate, formatRecurrenceLabel } from "../src/lib/recurrence.ts";
import { formatTodoDueLabel, isTodoOverdue } from "../src/lib/format.ts";

test("formatRecurrenceLabel formats standard and custom recurrence rules", () => {
  assert.equal(formatRecurrenceLabel(null), null);
  assert.equal(formatRecurrenceLabel({ type: "none" }), null);
  assert.equal(formatRecurrenceLabel({ type: "daily" }), "Daily");
  assert.equal(formatRecurrenceLabel({ type: "weekly" }), "Weekly");
  assert.equal(formatRecurrenceLabel({ type: "monthly" }), "Monthly");
  assert.equal(formatRecurrenceLabel({ type: "yearly" }), "Yearly");
  assert.equal(
    formatRecurrenceLabel({ type: "custom_weekly", days_of_week: [1, 3, 5] }),
    "Mon, Wed, Fri"
  );
  assert.equal(
    formatRecurrenceLabel({ type: "custom_monthly", day_of_month: 1 }),
    "1st of month"
  );
  assert.equal(
    formatRecurrenceLabel({ type: "custom_monthly", day_of_month: 15 }),
    "15th of month"
  );
});

test("calculateNextDueDate advances 1 cycle anchored on scheduled due date without schedule drift", () => {
  const ref = "2026-07-24";

  // Daily: due 2026-07-24 -> next is 2026-07-25
  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "daily" }, ref),
    "2026-07-25"
  );

  // Overdue daily: due 2026-07-20 -> next cycle is 2026-07-21 (anchored from scheduled due date)
  assert.equal(
    calculateNextDueDate("2026-07-20", { type: "daily" }, ref),
    "2026-07-21"
  );

  // Weekly: due 2026-07-20 (Mon) -> next is 2026-07-27 (Mon)
  assert.equal(
    calculateNextDueDate("2026-07-20", { type: "weekly" }, ref),
    "2026-07-27"
  );

  // Monthly: due 2026-07-15 -> next is 2026-08-15
  assert.equal(
    calculateNextDueDate("2026-07-15", { type: "monthly" }, ref),
    "2026-08-15"
  );

  // Yearly: due 2026-07-15 -> next is 2027-07-15
  assert.equal(
    calculateNextDueDate("2026-07-15", { type: "yearly" }, ref),
    "2027-07-15"
  );
});

test("calculateNextDueDate advances custom_weekly and custom_monthly", () => {
  const ref = "2026-07-24";

  // Custom weekly Mon (1), Wed (3), Fri (5) from Fri 2026-07-24 -> Next match is Mon 2026-07-27
  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "custom_weekly", days_of_week: [1, 3, 5] }, ref),
    "2026-07-27"
  );

  // Custom monthly 1st of month: From 2026-07-24 -> Next 1st is 2026-08-01
  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "custom_monthly", day_of_month: 1 }, ref),
    "2026-08-01"
  );
});

test("isTodoOverdue and formatTodoDueLabel trigger at start of day set for recurring reminders", () => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayIso = `${y}-${m}-${d}`;

  const tomorrowDate = new Date(today.getTime() + 86400000);
  const tmY = tomorrowDate.getFullYear();
  const tmM = String(tomorrowDate.getMonth() + 1).padStart(2, "0");
  const tmD = String(tomorrowDate.getDate()).padStart(2, "0");
  const tomorrowIso = `${tmY}-${tmM}-${tmD}`;

  const recurringRule = { type: "daily" };

  // Recurring todo due today triggers at start of day set
  assert.equal(isTodoOverdue("open", todayIso, recurringRule), true);
  assert.equal(formatTodoDueLabel("open", todayIso, recurringRule), "Due: Today");

  // Recurring todo due tomorrow does NOT trigger before start of day set
  assert.equal(isTodoOverdue("open", tomorrowIso, recurringRule), false);

  // Non-recurring todo due today does not trigger until past
  assert.equal(isTodoOverdue("open", todayIso, null), false);
});

