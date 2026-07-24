import type { PaymentStatus, RecurrenceRule } from "@/types/database";

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

/** Today in local timezone as YYYY-MM-DD. */
export function todayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** Open to-do with due date strictly before today (or on/before today for recurring items starting at start of day). */
export function isTodoOverdue(
  status: "open" | "done",
  dueDate: string | null | undefined,
  recurrenceRule?: RecurrenceRule | null
): boolean {
  if (status !== "open" || !dueDate) return false;
  const isRecurring = Boolean(
    recurrenceRule && recurrenceRule.type && recurrenceRule.type !== "none"
  );
  if (isRecurring) {
    return dueDate <= todayLocalIso();
  }
  return dueDate < todayLocalIso();
}

export function formatTodoDueLabel(
  status: "open" | "done",
  dueDate: string | null | undefined,
  recurrenceRule?: RecurrenceRule | null
): string {
  if (!dueDate) return "No due date";
  if (isTodoOverdue(status, dueDate, recurrenceRule)) {
    const due = new Date(dueDate + "T00:00:00");
    const today = new Date(todayLocalIso() + "T00:00:00");
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

