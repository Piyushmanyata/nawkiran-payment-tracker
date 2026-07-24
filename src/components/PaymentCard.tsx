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
import { PAYMENT_STATUS_UI } from "@/lib/ui";
import { getPaymentActions } from "@/lib/roles";

function PaymentCardInner({
  payment,
  role,
  onSelect,
  onApprove,
  onDeny,
  onMarkPaid,
  onDelete,
  onEdit,
}: {
  payment: Payment;
  role: UserRole | null;
  onSelect?: (p: Payment) => void;
  onApprove?: (p: Payment) => void;
  onDeny?: (p: Payment) => void;
  onMarkPaid?: (p: Payment) => void;
  onDelete?: (p: Payment) => void;
  onEdit?: (p: Payment) => void;
}) {
  const { showApprove, showMarkPaid, showEdit, showDelete } = getPaymentActions(
    payment,
    role,
    { onApprove, onDeny, onMarkPaid, onEdit, onDelete }
  );

  const editLabel =
    payment.status === "denied" ? "Correct & resubmit" : "Edit";

  const overdue = isOverdue(payment.status, payment.due_date);
  const config = PAYMENT_STATUS_UI[payment.status];

  return (
    <article
      onClick={() => onSelect?.(payment)}
      className={`group rounded-2xl border bg-white p-4 shadow-xs transition-all hover:shadow-md hover:border-slate-300 ${
        onSelect ? "cursor-pointer" : ""
      } ${config.containerClass}`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="text-base font-bold leading-snug text-slate-900 group-hover:text-blue-600 transition-colors break-words whitespace-normal">
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
            className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.badgeClass}`}
          >
            {config.badgeLabel}
          </span>
        </div>
      </div>

      {/* EXPRESS FLOW 3-STEP VISUAL STEPPER */}
      <div className="mt-3 py-2 px-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between text-xs">
        {/* Step 1: Requested */}
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px]">
            ✓
          </span>
          <span>1. Requested</span>
        </div>

        {/* Line 1 */}
        <div className="h-[2px] flex-1 mx-2 bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full ${config.line1Class}`}></div>
        </div>

        {/* Step 2: Approved */}
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span
            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${config.step2IconClass}`}
          >
            {config.step2IconText}
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

      {/* Tap hint */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 font-medium pt-1">
        <span>Tap card for audit history</span>
        <span className="group-hover:translate-x-0.5 transition-transform text-blue-600 font-bold">Details →</span>
      </div>

      {showApprove ? (
        <div
          className="mt-3 grid grid-cols-2 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <LoadingButton variant="primary" onClick={() => onApprove?.(payment)}>
            ✓ Approve
          </LoadingButton>
          <LoadingButton variant="danger" onClick={() => onDeny?.(payment)}>
            Deny
          </LoadingButton>
        </div>
      ) : null}

      {showMarkPaid ? (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          <LoadingButton variant="primary" onClick={() => onMarkPaid?.(payment)}>
            ✓ Mark Paid
          </LoadingButton>
        </div>
      ) : null}

      {showEdit ? (
        <div
          className={showApprove || showMarkPaid ? "mt-2" : "mt-3"}
          onClick={(e) => e.stopPropagation()}
        >
          <LoadingButton variant="secondary" onClick={() => onEdit?.(payment)}>
            {editLabel}
          </LoadingButton>
        </div>
      ) : null}

      {showDelete ? (
        <div
          className={showEdit ? "mt-2" : "mt-3"}
          onClick={(e) => e.stopPropagation()}
        >
          <LoadingButton variant="danger" onClick={() => onDelete?.(payment)}>
            Remove from history
          </LoadingButton>
        </div>
      ) : null}
    </article>
  );
}

export const PaymentCard = memo(PaymentCardInner);
