import type { PaymentStatus, RecurrenceRule } from "@/types/database";

export function isRecurringRule(rule?: RecurrenceRule | null): boolean {
  return Boolean(rule && rule.type && rule.type !== "none");
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

/** Format amount as Indian Rupees with grouping. */
export function formatInr(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "₹0";
  return inrFormatter.format(n);
}

/** Today in Asia/Kolkata (IST) timezone as YYYY-MM-DD. */
export function todayLocalIso(refDate?: Date): string {
  const d = refDate ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/** Hour in Asia/Kolkata (0-23). */
export function kolkataHour(refDate?: Date): number {
  const d = refDate ?? new Date();
  const hourStr = d.toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  });
  const h = Number(hourStr);
  return Number.isNaN(h) ? d.getHours() : h;
}

export function isOverdue(
  status: PaymentStatus,
  dueDate: string | null | undefined
): boolean {
  if (status !== "approved" || !dueDate) return false;
  return dueDate < todayLocalIso();
}

/** Human due-date label. Blank due date is never overdue. */
export function formatDueLabel(
  status: PaymentStatus,
  dueDate: string | null | undefined
): string {
  if (!dueDate) return "No due date";

  if (isOverdue(status, dueDate)) {
    const due = new Date(dueDate + "T00:00:00");
    const today = new Date(todayLocalIso() + "T00:00:00");
    const days = Math.round(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 1) return "Due: Overdue by 1 day";
    return `Due: Overdue by ${days} days`;
  }

  try {
    const d = new Date(dueDate + "T00:00:00");
    const label = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `Due: ${label}`;
  } catch {
    return `Due: ${dueDate}`;
  }
}

export function statusLabel(status: PaymentStatus): string {
  switch (status) {
    case "pending":
      return "Waiting Approval";
    case "approved":
      return "Outstanding";
    case "denied":
      return "Denied";
    case "paid":
      return "Paid";
    default:
      return status;
  }
}

/** Open to-do with due date strictly before today (or starting at 12:00 PM IST on due date for recurring items). */
export function isTodoOverdue(
  status: "open" | "done",
  dueDate: string | null | undefined,
  recurrenceRule?: RecurrenceRule | null,
  refDate?: Date
): boolean {
  if (status !== "open" || !dueDate) return false;
  const isRecurring = isRecurringRule(recurrenceRule);
  const now = refDate ?? new Date();
  const today = todayLocalIso(now);
  if (isRecurring) {
    if (dueDate < today) return true;
    if (dueDate === today) {
      return kolkataHour(now) >= 12;
    }
    return false;
  }
  return dueDate < today;
}

/** All open to-dos stay visible on shared board per domain spec (§4 & §5). */
export function isTodoVisible(
  _todo: { status: "open" | "done"; due_date?: string | null; recurrence_rule?: RecurrenceRule | null },
  _refDate?: Date
): boolean {
  return true;
}

export function formatTodoDueLabel(
  status: "open" | "done",
  dueDate: string | null | undefined,
  recurrenceRule?: RecurrenceRule | null,
  refDate?: Date
): string {
  if (!dueDate) return "No due date";
  const now = refDate ?? new Date();
  if (isTodoOverdue(status, dueDate, recurrenceRule, now)) {
    const due = new Date(dueDate + "T00:00:00");
    const today = new Date(todayLocalIso(now) + "T00:00:00");
    const days = Math.round(
      (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days === 0) return "Due: Today";
    if (days === 1) return "Due: Overdue by 1 day";
    return `Due: Overdue by ${days} days`;
  }
  try {
    const d = new Date(dueDate + "T00:00:00");
    const label = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `Due: ${label}`;
  } catch {
    return `Due: ${dueDate}`;
  }
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Detailed date time formatting for audit trail: 23 Jul 2026, 04:30 PM */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/** Friendly relative time: 5m ago, 2h ago, 3d ago */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    return "";
  } catch {
    return "";
  }
}

