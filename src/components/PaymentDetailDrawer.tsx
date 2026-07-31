"use client";

import { useEffect } from "react";
import type { Payment, UserRole } from "@/types/database";
import { formatDateTime, formatDueLabel, formatInr, formatRelativeTime, isOverdue } from "@/lib/format";
import { PartyTagBadges } from "@/components/PartyTagBadges";
import { LoadingButton } from "@/components/LoadingButton";
import { getPaymentActions } from "@/lib/roles";
import { PAYMENT_STATUS_UI } from "@/lib/ui";

export function PaymentDetailDrawer({
  payment,
  role,
  userId,
  onClose,
  onApprove,
  onDeny,
  onMarkPaid,
  onEdit,
  onWithdraw,
  onDelete,
}: {
  payment: Payment | null;
  role: UserRole | null;
  userId?: string | null;
  onClose: () => void;
  onApprove?: (p: Payment) => void;
  onDeny?: (p: Payment) => void;
  onMarkPaid?: (p: Payment) => void;
  onEdit?: (p: Payment) => void;
  onWithdraw?: (p: Payment) => void;
  onDelete?: (p: Payment) => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (payment) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [payment, onClose]);

  if (!payment) return null;

  const { showApprove, showMarkPaid, showEdit, showWithdraw, showDelete } =
    getPaymentActions(
      payment,
      role,
      { onApprove, onDeny, onMarkPaid, onEdit, onWithdraw, onDelete },
      userId
    );

  const overdue = isOverdue(payment.status, payment.due_date);
  const badge = PAYMENT_STATUS_UI[payment.status];
  const relativeReq = formatRelativeTime(payment.requested_at);
  // Withdrawn rows keep their denial fields — step 2 still reads as a denial.
  const wasDenied = payment.status === "denied" || payment.status === "withdrawn";
  const isWithdrawn = payment.status === "withdrawn";

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside
        className="relative z-10 w-full md:w-[460px] bg-white rounded-t-3xl md:rounded-l-2xl md:rounded-tr-none shadow-2xl max-h-[90vh] md:max-h-full flex flex-col overflow-hidden transition-transform animate-in slide-in-from-bottom md:slide-in-from-right duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-detail-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 md:p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="space-y-1 pr-4 min-w-0">
            <span
              className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badge.badgeClass}`}
            >
              {badge.badgeLabel}
            </span>
            <h2
              id="payment-detail-title"
              className="text-xl font-extrabold text-slate-900 break-words whitespace-normal"
            >
              {payment.party}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <PartyTagBadges party={payment.party} />
              <span
                className={`text-xs ${
                  overdue ? "font-semibold text-amber-700" : "text-slate-500"
                }`}
              >
                {formatDueLabel(payment.status, payment.due_date)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-2xl font-black text-slate-900 tabular-nums">
                {formatInr(payment.amount)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition text-sm font-bold"
              aria-label="Close detail panel"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Audit Timeline Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Audit & Activity Details
            </h3>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {/* STEP 1: REQUESTED */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold ring-4 ring-white">
                  ✓
                </div>
                <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      1. Requested
                    </span>
                    {relativeReq && (
                      <span className="text-[11px] font-semibold text-slate-400">
                        {relativeReq}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                    <p>
                      <span className="font-semibold text-slate-700">Requested by: </span>
                      {payment.requester_name || "Staff Requester"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatDateTime(payment.requested_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* STEP 2: APPROVAL STATUS */}
              <div className="relative">
                <div
                  className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ring-4 ring-white ${
                    payment.status === "pending"
                      ? "bg-amber-500 text-white"
                      : wasDenied
                      ? "bg-rose-500 text-white"
                      : "bg-indigo-600 text-white"
                  }`}
                >
                  {payment.status === "pending" ? "2" : wasDenied ? "✕" : "✓"}
                </div>
                <div
                  className={`rounded-xl p-3 border ${
                    wasDenied
                      ? "bg-rose-50/50 border-rose-100"
                      : payment.status === "pending"
                      ? "bg-amber-50/50 border-amber-100"
                      : "bg-slate-50/80 border-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      2. Approved
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        payment.status === "pending"
                          ? "text-amber-700"
                          : wasDenied
                          ? "text-rose-700"
                          : "text-indigo-700"
                      }`}
                    >
                      {payment.status === "pending"
                        ? "Awaiting Action"
                        : wasDenied
                        ? "Denied"
                        : "Approved"}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                    {payment.status === "pending" && (
                      <p className="text-slate-500 italic">
                        Pending review and approval by Director.
                      </p>
                    )}
                    {payment.status !== "pending" && payment.approved_at && (
                      <>
                        <p>
                          <span className="font-semibold text-slate-700">Approved by: </span>
                          {payment.approver_name || "Director"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTime(payment.approved_at)}
                        </p>
                      </>
                    )}
                    {wasDenied && (
                      <>
                        <p>
                          <span className="font-semibold text-slate-700">Denied by: </span>
                          {payment.denier_name || "Director"}
                        </p>
                        {payment.denied_at && (
                          <p className="text-[11px] text-slate-500">
                            {formatDateTime(payment.denied_at)}
                          </p>
                        )}
                        {payment.denial_reason && (
                          <div className="mt-2 p-2 rounded-lg bg-rose-100/70 border border-rose-200 text-rose-800 text-xs">
                            <span className="font-bold">Reason: </span>
                            {payment.denial_reason}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 3: PAYOUT EXECUTION */}
              <div className="relative">
                <div
                  className={`absolute -left-6 top-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ring-4 ring-white ${
                    payment.status === "paid"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  }`}
                >
                  {payment.status === "paid" ? "✓" : "3"}
                </div>
                <div
                  className={`rounded-xl p-3 border ${
                    payment.status === "paid"
                      ? "bg-emerald-50/50 border-emerald-100"
                      : "bg-slate-50/50 border-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      {isWithdrawn ? "3. Closed" : "3. Paid"}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        payment.status === "paid"
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }`}
                    >
                      {payment.status === "paid"
                        ? "Completed"
                        : isWithdrawn
                        ? "Withdrawn"
                        : "Pending"}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                    {payment.status === "paid" ? (
                      <>
                        <p>
                          <span className="font-semibold text-slate-700">Marked paid by: </span>
                          {payment.payer_name || "Accounts / Staff"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateTime(payment.paid_at)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                          {payment.payment_mode && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
                              Mode: {payment.payment_mode}
                            </span>
                          )}
                          {payment.payment_reference && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 font-mono font-medium">
                              Ref: {payment.payment_reference}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-slate-400 italic">
                        {payment.status === "approved"
                          ? "Ready for payout execution."
                          : isWithdrawn
                          ? `Withdrawn by ${payment.requester_name || "the requester"} — no payout will be made.`
                          : "Requires approval before payout."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {(showApprove || showMarkPaid || showEdit || showWithdraw || showDelete) && (
          <div className="p-5 md:p-6 border-t border-slate-100 bg-slate-50/80 space-y-2">
            {showApprove && (
              <div className="grid grid-cols-2 gap-2">
                <LoadingButton
                  variant="primary"
                  onClick={() => {
                    onApprove?.(payment);
                    onClose();
                  }}
                >
                  ✓ Approve
                </LoadingButton>
                <LoadingButton
                  variant="danger"
                  onClick={() => {
                    onDeny?.(payment);
                    onClose();
                  }}
                >
                  Deny
                </LoadingButton>
              </div>
            )}

            {showMarkPaid && (
              <LoadingButton
                variant="primary"
                onClick={() => {
                  onMarkPaid?.(payment);
                  onClose();
                }}
              >
                ✓ Mark Paid
              </LoadingButton>
            )}

            {showEdit && (
              <LoadingButton
                variant="secondary"
                onClick={() => {
                  onEdit?.(payment);
                  onClose();
                }}
              >
                {payment.status === "denied"
                  ? "Correct & Resubmit"
                  : "Edit Payment"}
              </LoadingButton>
            )}

            {showWithdraw && (
              <LoadingButton
                variant="secondary"
                onClick={() => {
                  onWithdraw?.(payment);
                  onClose();
                }}
              >
                Withdraw Request
              </LoadingButton>
            )}

            {showDelete && (
              <LoadingButton
                variant="danger"
                onClick={() => {
                  onDelete?.(payment);
                }}
              >
                Delete
              </LoadingButton>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
