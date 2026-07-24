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
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAYS_SHORT[d])
        .filter(Boolean);
      return days.length > 0 ? days.join(", ") : "Weekly";
    }
    case "custom_monthly": {
      const dayVal = rule.day_of_month ?? 1;
      const suffix =
        dayVal === 1 || dayVal === 21 || dayVal === 31
          ? "st"
          : dayVal === 2 || dayVal === 22
          ? "nd"
          : dayVal === 3 || dayVal === 23
          ? "rd"
          : "th";
      return `${dayVal}${suffix} of month`;
    }
    default:
      return null;
  }
}

/**
 * Calculate the next ISO date ("YYYY-MM-DD") anchored strictly from scheduled due date.
 * Advances 1 cycle from currentDueDate (preserving fixed cadence without schedule drift).
 */
export function calculateNextDueDate(
  currentDueDate: string | null | undefined,
  rule: RecurrenceRule | null | undefined,
  refDateStr?: string
): string | null {
  if (!rule || rule.type === "none") return null;

  const todayIso = refDateStr ?? new Date().toISOString().slice(0, 10);
  const baseIso = currentDueDate || todayIso;

  const base = new Date(`${baseIso}T00:00:00Z`);
  if (isNaN(base.getTime())) return null;

  const cursor = new Date(base.getTime());

  if (rule.type === "daily") {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "weekly") {
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "monthly") {
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    return cursor.toISOString().slice(0, 10);
  }

  if (rule.type === "yearly") {
    cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
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
      if (targetDays.has(isoDay)) {
        return cursor.toISOString().slice(0, 10);
      }
      safety++;
    } while (safety < 366);
    return null;
  }

  if (rule.type === "custom_monthly") {
    const targetDom = Math.min(Math.max(rule.day_of_month ?? 1, 1), 31);
    let safety = 0;
    do {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (cursor.getUTCDate() === targetDom) {
        return cursor.toISOString().slice(0, 10);
      }
      safety++;
    } while (safety < 366);
    return null;
  }

  return null;
}

/**
  Calculate the initial scheduled due date when creating a recurring to-do.
  If created on a day matching the pattern, returns today; otherwise returns the first upcoming matching date.
 */
export function calculateInitialDueDate(
  rule: RecurrenceRule | null | undefined,
  refDateStr?: string
): string {
  const todayIso = refDateStr ?? new Date().toISOString().slice(0, 10);
  if (!rule || rule.type === "none" || rule.type === "daily" || rule.type === "weekly" || rule.type === "monthly" || rule.type === "yearly") {
    return todayIso;
  }

  const base = new Date(`${todayIso}T00:00:00Z`);
  if (isNaN(base.getTime())) return todayIso;

  if (rule.type === "custom_weekly") {
    const targetDays = new Set(rule.days_of_week ?? []);
    if (targetDays.size === 0) return todayIso;
    const jsDay = base.getUTCDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;
    if (targetDays.has(isoDay)) return todayIso;
    return calculateNextDueDate(todayIso, rule, todayIso) ?? todayIso;
  }

  if (rule.type === "custom_monthly") {
    const targetDom = Math.min(Math.max(rule.day_of_month ?? 1, 1), 31);
    if (base.getUTCDate() === targetDom) return todayIso;
    return calculateNextDueDate(todayIso, rule, todayIso) ?? todayIso;
  }

  return todayIso;
}
