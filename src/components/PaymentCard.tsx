"use client";

import { memo } from "react";
import type { Payment, UserRole } from "@/types/database";
import { formatDueLabel, formatInr, isOverdue } from "@/lib/format";
import {
  canApprove as roleCanApprove,
  canDeleteHistory,
  canMarkPaid as roleCanMarkPaid,
} from "@/lib/roles";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingButton } from "@/components/LoadingButton";

function PaymentCardInner({
  payment,
  role,
  onApprove,
  onDeny,
  onMarkPaid,
  onDelete,
  onCorrect,
}: {
  payment: Payment;
  role: UserRole | null;
  onApprove?: (p: Payment) => void;
  onDeny?: (p: Payment) => void;
  onMarkPaid?: (p: Payment) => void;
  onDelete?: (p: Payment) => void;
  onCorrect?: (p: Payment) => void;
}) {
  const showApprove =
    payment.status === "pending" &&
    roleCanApprove(role) &&
    Boolean(onApprove && onDeny);

  const showMarkPaid =
    payment.status === "approved" &&
    roleCanMarkPaid(role) &&
    Boolean(onMarkPaid);

  const showCorrect = payment.status === "denied" && Boolean(onCorrect);

  const showDelete =
    (payment.status === "paid" || payment.status === "denied") &&
    canDeleteHistory(role) &&
    Boolean(onDelete);

  const overdue = isOverdue(payment.status, payment.due_date);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300 ${
        payment.status === "denied" ? "border-red-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold leading-snug text-slate-900">
            {payment.party}
          </h3>
          <div className="mt-1.5">
            <StatusBadge status={payment.status} dueDate={payment.due_date} />
          </div>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums text-slate-900">
          {formatInr(payment.amount)}
        </p>
      </div>

      <p
        className={`mt-3 text-sm ${
          overdue ? "font-semibold text-amber-800" : "text-slate-600"
        }`}
      >
        {formatDueLabel(payment.status, payment.due_date)}
      </p>

      {payment.purpose ? (
        <p className="mt-2 line-clamp-3 text-sm text-slate-700">{payment.purpose}</p>
      ) : null}

      {payment.requester_name ? (
        <p className="mt-2 text-xs text-slate-500">
          Requested by {payment.requester_name}
        </p>
      ) : null}

      {payment.status === "denied" && payment.denial_reason ? (
        <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm text-red-700">
          <span className="font-semibold">Denial reason: </span>
          {payment.denial_reason}
        </p>
      ) : null}

      {showApprove ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LoadingButton variant="primary" onClick={() => onApprove?.(payment)}>
            Approve
          </LoadingButton>
          <LoadingButton variant="danger" onClick={() => onDeny?.(payment)}>
            Deny
          </LoadingButton>
        </div>
      ) : null}

      {showMarkPaid ? (
        <div className="mt-4">
          <LoadingButton variant="primary" onClick={() => onMarkPaid?.(payment)}>
            Mark Paid
          </LoadingButton>
        </div>
      ) : null}

      {showCorrect ? (
        <div className="mt-4">
          <LoadingButton variant="primary" onClick={() => onCorrect?.(payment)}>
            Correct & resubmit
          </LoadingButton>
        </div>
      ) : null}

      {showDelete ? (
        <div className={showCorrect ? "mt-2" : "mt-4"}>
          <LoadingButton variant="danger" onClick={() => onDelete?.(payment)}>
            Remove from history
          </LoadingButton>
        </div>
      ) : null}
    </article>
  );
}

export const PaymentCard = memo(PaymentCardInner);
