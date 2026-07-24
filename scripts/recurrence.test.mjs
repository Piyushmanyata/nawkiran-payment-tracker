import assert from "node:assert/strict";
import test from "node:test";
import { calculateInitialDueDate, calculateNextDueDate, formatRecurrenceLabel } from "../src/lib/recurrence.ts";
import { formatTodoDueLabel, isTodoOverdue, isTodoVisible } from "../src/lib/format.ts";

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

test("isTodoVisible keeps all open to-dos visible on shared board per domain spec", () => {
  const refTime = new Date("2026-07-24T10:00:00+05:30"); // Friday 24 Jul 2026
  const recurringRule = { type: "custom_weekly", days_of_week: [1] }; // Every Monday

  // Scheduled for next Monday 27 Jul -> visible on screen per domain spec invariant (§4 & §5)
  assert.equal(
    isTodoVisible({ status: "open", due_date: "2026-07-27", recurrence_rule: recurringRule }, refTime),
    true
  );

  // Scheduled for today Friday 24 Jul -> visible on screen
  assert.equal(
    isTodoVisible({ status: "open", due_date: "2026-07-24", recurrence_rule: recurringRule }, refTime),
    true
  );

  // Non-recurring future todo -> visible on screen
  assert.equal(
    isTodoVisible({ status: "open", due_date: "2026-07-27", recurrence_rule: null }, refTime),
    true
  );
});

test("calculateInitialDueDate returns today if matching or calculates first upcoming occurrence", () => {
  const fridayRef = "2026-07-24"; // Friday (ISO day 5)

  // Every Monday (ISO day 1) created on Friday -> initial due date is upcoming Monday 2026-07-27
  assert.equal(
    calculateInitialDueDate({ type: "custom_weekly", days_of_week: [1] }, fridayRef),
    "2026-07-27"
  );

  // Every Friday created on Friday -> initial due date is today 2026-07-24
  assert.equal(
    calculateInitialDueDate({ type: "custom_weekly", days_of_week: [5] }, fridayRef),
    "2026-07-24"
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

test("isTodoOverdue and formatTodoDueLabel trigger at 12pm on the recurring date", () => {
  const recurringRule = { type: "daily" };
  const todayIso = "2026-07-24";
  const tomorrowIso = "2026-07-25";

  const morningTime = new Date("2026-07-24T09:00:00+05:30");
  const noonTime = new Date("2026-07-24T12:00:00+05:30");
  const afternoonTime = new Date("2026-07-24T14:30:00+05:30");

  // Before 12pm on the due date: recurring reminder does NOT trigger yet
  assert.equal(isTodoOverdue("open", todayIso, recurringRule, morningTime), false);

  // At or after 12pm on the due date: recurring reminder triggers
  assert.equal(isTodoOverdue("open", todayIso, recurringRule, noonTime), true);
  assert.equal(formatTodoDueLabel("open", todayIso, recurringRule, noonTime), "Due: Today");

  assert.equal(isTodoOverdue("open", todayIso, recurringRule, afternoonTime), true);

  // Tomorrow's recurring todo does not trigger today
  assert.equal(isTodoOverdue("open", tomorrowIso, recurringRule, afternoonTime), false);

  // Non-recurring todo due today does not trigger today even at 2pm
  assert.equal(isTodoOverdue("open", todayIso, null, afternoonTime), false);
});

