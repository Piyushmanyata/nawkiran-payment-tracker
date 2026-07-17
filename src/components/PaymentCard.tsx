"use client";

import type { Payment, UserRole } from "@/types/database";
import { formatDueLabel, formatInr, statusLabel } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingButton } from "@/components/LoadingButton";

export function PaymentCard({
  payment,
  role,
  onApprove,
  onDeny,
  onMarkPaid,
}: {
  payment: Payment;
  role: UserRole | null;
  onApprove?: (p: Payment) => void;
  onDeny?: (p: Payment) => void;
  onMarkPaid?: (p: Payment) => void;
}) {
  const canApprove =
    payment.status === "pending" &&
    (role === "director" || role === "admin") &&
    onApprove &&
    onDeny;

  const canMarkPaid =
    payment.status === "approved" &&
    (role === "accounts" || role === "admin") &&
    onMarkPaid;

  const secondaryLine =
    payment.status === "approved"
      ? "Approved · Outstanding"
      : payment.status === "pending"
        ? "Pending approval"
        : statusLabel(payment.status);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold leading-snug text-slate-900">
          {payment.party}
        </h3>
        <p className="shrink-0 text-lg font-bold tabular-nums text-slate-900">
          {formatInr(payment.amount)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusBadge status={payment.status} dueDate={payment.due_date} />
        <span className="text-sm text-slate-600">{secondaryLine}</span>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        {formatDueLabel(payment.status, payment.due_date)}
      </p>

      {payment.purpose ? (
        <p className="mt-2 text-sm text-slate-700">{payment.purpose}</p>
      ) : null}

      {payment.requester_name ? (
        <p className="mt-2 text-sm text-slate-500">
          Requested by {payment.requester_name}
        </p>
      ) : null}

      {payment.status === "denied" && payment.denial_reason ? (
        <p className="mt-2 text-sm text-red-700">
          Reason: {payment.denial_reason}
        </p>
      ) : null}

      {payment.status === "paid" && payment.payment_mode ? (
        <p className="mt-2 text-sm text-slate-500">
          {payment.payment_mode}
          {payment.payment_reference
            ? ` · ${payment.payment_reference}`
            : ""}
        </p>
      ) : null}

      {canApprove ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LoadingButton variant="primary" onClick={() => onApprove(payment)}>
            Approve
          </LoadingButton>
          <LoadingButton variant="danger" onClick={() => onDeny(payment)}>
            Deny
          </LoadingButton>
        </div>
      ) : null}

      {canMarkPaid ? (
        <div className="mt-4">
          <LoadingButton variant="primary" onClick={() => onMarkPaid(payment)}>
            Mark Paid
          </LoadingButton>
        </div>
      ) : null}
    </article>
  );
}
