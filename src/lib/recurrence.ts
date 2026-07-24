import type { RecurrenceRule } from "@/types/database";

const DAYS_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Format recurrence rule for display on cards or labels (e.g., "Daily", "Weekly", "Mon, Wed, Fri", "15th of month").
 */
export function formatRecurrenceLabel(rule: RecurrenceRule | null | undefined): string | null {
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

/**
 * Calculate the next ISO date ("YYYY-MM-DD") anchored from scheduled due date (or refDate if null).
 * Ensures the resulting date is strictly in the future relative to refDate.
 */
export function calculateNextDueDate(
  currentDueDate: string | null | undefined,
  rule: RecurrenceRule | null | undefined,
  refDateStr?: string
): string | null {
  if (!rule || rule.type === "none") return null;

  // Use refDate (defaulting to today UTC/local ISO date)
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
    // 1 = Mon ... 7 = Sun (convert JS getUTCDay() 0=Sun..6=Sat)
    // JS getUTCDay(): 0->7, 1->1, 2->2, 3->3, 4->4, 5->5, 6->6
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
