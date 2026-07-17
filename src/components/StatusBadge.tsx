import type { PaymentStatus } from "@/types/database";
import { isOverdue, statusLabel } from "@/lib/format";

export function StatusBadge({
  status,
  dueDate,
}: {
  status: PaymentStatus;
  dueDate?: string | null;
}) {
  const overdue = isOverdue(status, dueDate);
  const label = overdue ? "Overdue" : statusLabel(status);

  const colors = overdue
    ? "bg-amber-100 text-amber-900"
    : status === "pending"
      ? "bg-sky-100 text-sky-900"
      : status === "approved"
        ? "bg-violet-100 text-violet-900"
        : status === "denied"
          ? "bg-red-100 text-red-900"
          : "bg-emerald-100 text-emerald-900";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors}`}
    >
      {label}
    </span>
  );
}
