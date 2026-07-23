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
      className={`rounded-2xl border bg-white p-4 shadow-xs transition hover:border-slate-300 ${
        payment.status === "denied"
          ? "border-rose-200 bg-rose-50/10"
          : payment.status === "paid"
          ? "border-slate-200 bg-slate-50/20"
          : "border-slate-200"
      }`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="truncate text-base font-bold leading-snug text-slate-900">
              {payment.party}
            </h3>
            <PartyTagBadges party={payment.party} />
          </div>
          <p
            className={`mt-1 text-xs ${
              overdue ? "font-semibold text-amber-800" : "text-slate-500"
            }`}
          >
            {formatDueLabel(payment.status, payment.due_date)}
            {payment.requester_name ? ` · Req by ${payment.requester_name}` : ""}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-lg font-black tabular-nums text-slate-900">
            {formatInr(payment.amount)}
          </p>
          <span
            className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              payment.status === "pending"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : payment.status === "approved"
                ? "bg-blue-50 text-blue-800 border-blue-200"
                : payment.status === "denied"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            {payment.status === "pending"
              ? "Pending Approval"
              : payment.status === "approved"
              ? "Approved"
              : payment.status === "denied"
              ? "Denied"
              : "Paid"}
          </span>
        </div>
      </div>

      {/* EXPRESS FLOW 3-STEP VISUAL STEPPER */}
      <div className="mt-3 py-2 px-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
        {/* Step 1: Requested */}
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px]">
            ✓
          </span>
          <span>1. Requested</span>
        </div>

        {/* Line 1 */}
        <div className="h-[2px] flex-1 mx-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${
              payment.status === "approved" || payment.status === "paid"
                ? "bg-emerald-500"
                : payment.status === "denied"
                ? "bg-rose-400"
                : "bg-amber-400"
            }`}
          ></div>
        </div>

        {/* Step 2: Approved */}
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
              payment.status === "approved" || payment.status === "paid"
                ? "bg-emerald-600 text-white"
                : payment.status === "denied"
                ? "bg-rose-500 text-white"
                : "bg-amber-500 text-white"
            }`}
          >
            {payment.status === "approved" || payment.status === "paid"
              ? "✓"
              : payment.status === "denied"
              ? "✕"
              : "2"}
          </span>
          <span>2. Approved</span>
        </div>


        {/* Line 2 */}
        <div className="h-[2px] flex-1 mx-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${payment.status === "paid" ? "bg-emerald-500" : "bg-slate-200"}`}
          ></div>
        </div>

        {/* Step 3: Paid */}
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
              payment.status === "paid" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
            }`}
          >
            {payment.status === "paid" ? "✓" : "3"}
          </span>
          <span className={payment.status === "paid" ? "text-emerald-700" : "text-slate-400"}>
            3. Paid
          </span>
        </div>
      </div>

      {payment.status === "denied" && payment.denial_reason ? (
        <p className="mt-2.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 border border-rose-100 font-medium">
          <span className="font-semibold">Denial reason: </span>
          {payment.denial_reason}
        </p>
      ) : null}

      {showApprove ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <LoadingButton variant="primary" onClick={() => onApprove?.(payment)}>
            ✓ Approve
          </LoadingButton>
          <LoadingButton variant="danger" onClick={() => onDeny?.(payment)}>
            Deny
          </LoadingButton>
        </div>
      ) : null}

      {showMarkPaid ? (
        <div className="mt-3.5">
          <LoadingButton variant="primary" onClick={() => onMarkPaid?.(payment)}>
            ✓ Mark Paid
          </LoadingButton>
        </div>
      ) : null}

      {showEdit ? (
        <div className={showApprove || showMarkPaid ? "mt-2" : "mt-3.5"}>
          <LoadingButton variant="secondary" onClick={() => onEdit?.(payment)}>
            {editLabel}
          </LoadingButton>
        </div>
      ) : null}

      {showDelete ? (
        <div className={showEdit ? "mt-2" : "mt-3.5"}>
          <LoadingButton variant="danger" onClick={() => onDelete?.(payment)}>
            Remove from history
          </LoadingButton>
        </div>
      ) : null}
    </article>
  );
}

export const PaymentCard = memo(PaymentCardInner);
