import type { PaymentStatus } from "@/types/database";

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
