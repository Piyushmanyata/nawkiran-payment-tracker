"use client";

import { memo } from "react";
import type { Payment, UserRole } from "@/types/database";
import { formatDueLabel, formatInr, isOverdue } from "@/lib/format";
import {
  canApprove as roleCanApprove,
  canDeleteHistory,
  canEditPayment as roleCanEdit,
  canMarkPaid as roleCanMarkPaid,
} from "@/lib/roles";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingButton } from "@/components/LoadingButton";
import { PartyTagBadges } from "@/components/PartyTagBadges";

function PaymentCardInner({
  payment,
  role,
  onApprove,
  onDeny,
  onMarkPaid,
  onDelete,
  onEdit,
}: {
  payment: Payment;
  role: UserRole | null;
  onApprove?: (p: Payment) => void;
  onDeny?: (p: Payment) => void;
  onMarkPaid?: (p: Payment) => void;
  onDelete?: (p: Payment) => void;
  onEdit?: (p: Payment) => void;
}) {
  const showApprove =
    payment.status === "pending" &&
    roleCanApprove(role) &&
    Boolean(onApprove && onDeny);

  const showMarkPaid =
    payment.status === "approved" &&
    roleCanMarkPaid(role) &&
    Boolean(onMarkPaid);

  const unpaid =
    payment.status === "pending" ||
    payment.status === "approved" ||
    payment.status === "denied";

  const showEdit = unpaid && roleCanEdit(role, payment) && Boolean(onEdit);
  const editLabel =
    payment.status === "denied" ? "Correct & resubmit" : "Edit";

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
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-bold leading-snug text-slate-900">
              {payment.party}
            </h3>
            <PartyTagBadges party={payment.party} />
          </div>
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

      {payment.requester_name ||
      payment.approver_name ||
      payment.denier_name ||
      payment.payer_name ? (
        <dl className="mt-2 grid gap-0.5 text-xs text-slate-500">
          {payment.requester_name ? (
            <div className="flex gap-1">
              <dt>Requested by</dt>
              <dd className="font-semibold text-slate-600">
                {payment.requester_name}
              </dd>
            </div>
          ) : null}
          {payment.approver_name ? (
            <div className="flex gap-1">
              <dt>Approved by</dt>
              <dd className="font-semibold text-slate-600">
                {payment.approver_name}
              </dd>
            </div>
          ) : null}
          {payment.denier_name ? (
            <div className="flex gap-1">
              <dt>Denied by</dt>
              <dd className="font-semibold text-slate-600">
                {payment.denier_name}
              </dd>
            </div>
          ) : null}
          {payment.payer_name ? (
            <div className="flex gap-1">
              <dt>Marked paid by</dt>
              <dd className="font-semibold text-slate-600">
                {payment.payer_name}
              </dd>
            </div>
          ) : null}
        </dl>
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

      {showEdit ? (
        <div className={showApprove || showMarkPaid ? "mt-2" : "mt-4"}>
          <LoadingButton variant="secondary" onClick={() => onEdit?.(payment)}>
            {editLabel}
          </LoadingButton>
        </div>
      ) : null}

      {showDelete ? (
        <div className={showEdit ? "mt-2" : "mt-4"}>
          <LoadingButton variant="danger" onClick={() => onDelete?.(payment)}>
            Remove from history
          </LoadingButton>
        </div>
      ) : null}
    </article>
  );
}

export const PaymentCard = memo(PaymentCardInner);
