import assert from "node:assert/strict";
import test from "node:test";

const DAYS_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatRecurrenceLabel(rule) {
  if (!rule || rule.type === "none") return null;
  switch (rule.type) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "custom_weekly": {
      const days = (rule.days_of_week ?? [])
        .sort((a, b) => a - b)
        .map((d) => DAYS_SHORT[d])
        .filter(Boolean);
      return days.length > 0 ? days.join(", ") : "Weekly";
    }
    case "custom_monthly": {
      const dom = rule.day_of_month ?? 1;
      const suffix =
        dom === 1 || dom === 21 || dom === 31
          ? "st"
          : dom === 2 || dom === 22
          ? "nd"
          : dom === 3 || dom === 23
          ? "rd"
          : "th";
      return `${dom}${suffix} of month`;
    }
    default:
      return null;
  }
}

function calculateNextDueDate(currentDueDate, rule, refDateStr) {
  if (!rule || rule.type === "none") return null;

  const todayIso = refDateStr ?? new Date().toISOString().slice(0, 10);
  const baseIso = currentDueDate || todayIso;

  const base = new Date(`${baseIso}T00:00:00Z`);
  const ref = new Date(`${todayIso}T00:00:00Z`);

  if (isNaN(base.getTime()) || isNaN(ref.getTime())) return null;

  const cursor = new Date(base.getTime());

  if (rule.type === "daily") {
    do {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    } while (cursor <= ref);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "weekly") {
    do {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } while (cursor <= ref);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "monthly") {
    do {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    } while (cursor <= ref);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "yearly") {
    do {
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
    } while (cursor <= ref);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "custom_weekly") {
    const targetDays = new Set(rule.days_of_week ?? []);
    if (targetDays.size === 0) return null;
    let safety = 0;
    do {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const jsDay = cursor.getUTCDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      if (targetDays.has(isoDay) && cursor > ref) {
        return cursor.toISOString().slice(0, 10);
      }
      safety++;
    } while (safety < 366);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "custom_monthly") {
    const targetDom = Math.min(Math.max(rule.day_of_month ?? 1, 1), 31);
    let safety = 0;
    do {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCDate() === targetDom && cursor > ref) {
        return cursor.toISOString().slice(0, 10);
      }
      safety++;
    } while (safety < 366);
    return cursor.toISOString().slice(0, 10);
  }

  return null;
}

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

test("calculateNextDueDate advances daily, weekly, monthly, yearly anchored on scheduled due date", () => {
  const ref = "2026-07-24";

  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "daily" }, ref),
    "2026-07-25"
  );

  assert.equal(
    calculateNextDueDate("2026-07-20", { type: "daily" }, ref),
    "2026-07-25"
  );

  assert.equal(
    calculateNextDueDate("2026-07-20", { type: "weekly" }, ref),
    "2026-07-27"
  );

  assert.equal(
    calculateNextDueDate("2026-07-15", { type: "monthly" }, ref),
    "2026-08-15"
  );

  assert.equal(
    calculateNextDueDate("2026-07-15", { type: "yearly" }, ref),
    "2027-07-15"
  );
});

test("calculateNextDueDate advances custom_weekly and custom_monthly", () => {
  const ref = "2026-07-24"; // Friday (ISO day 5)

  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "custom_weekly", days_of_week: [1, 3, 5] }, ref),
    "2026-07-27"
  );

  assert.equal(
    calculateNextDueDate("2026-07-24", { type: "custom_monthly", day_of_month: 1 }, ref),
    "2026-08-01"
  );
});
