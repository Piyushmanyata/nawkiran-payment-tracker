"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals, type PaymentFilterMode } from "@/components/PaymentTotals";
import { AddPaymentForm } from "@/components/AddPaymentForm";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageLoading } from "@/components/PageLoading";
import {
  approvePayment,
  denyPayment,
  editUnpaidPayment,
  markPaymentPaid,
} from "@/lib/payments";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";
import { userMessageFromError } from "@/lib/errors";
import { canApprove, canEditPayment, canMarkPaid } from "@/lib/roles";
import type { EditPaymentInput, Payment, PaymentMode } from "@/types/database";


const ApproveDialog = dynamic(() =>
  import("@/components/ApproveDialog").then((mod) => mod.ApproveDialog)
);
const MarkPaidDialog = dynamic(() =>
  import("@/components/MarkPaidDialog").then((mod) => mod.MarkPaidDialog)
);
const DenyDialog = dynamic(() =>
  import("@/components/DenyDialog").then((mod) => mod.DenyDialog)
);
const CorrectPaymentDialog = dynamic(() =>
  import("@/components/CorrectPaymentDialog").then((mod) => mod.CorrectPaymentDialog)
);
const HistoryWeekList = dynamic(() =>
  import("@/components/HistoryWeekList").then((mod) => mod.HistoryWeekList)
);
const PaymentDetailDrawer = dynamic(() =>
  import("@/components/PaymentDetailDrawer").then((mod) => mod.PaymentDetailDrawer)
);

export default function OpenPage() {
  const searchParams = useSearchParams();
  const actionParam = searchParams.get("action");
  const filterParam = searchParams.get("filter") as PaymentFilterMode | null;

  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const {
    payments,
    loading,
    error,
    setError,
    reload,
    upsertPayment,
  } = usePaymentsLive();

  const [busy, setBusy] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(actionParam === "add");
  const [activeFilter, setActiveFilter] = useState<PaymentFilterMode>(filterParam || "all");

  const [detailTarget, setDetailTarget] = useState<Payment | null>(null);
  const [approveTarget, setApproveTarget] = useState<Payment | null>(null);
  const [markPaidTarget, setMarkPaidTarget] = useState<Payment | null>(null);
  const [denyTarget, setDenyTarget] = useState<Payment | null>(null);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);

  const canEdit = canEditPayment(role);
  const userCanApprove = canApprove(role);
  const userCanMarkPaid = canMarkPaid(role);

  // Filtered Payments Stream for Single Page Hub
  const filteredPayments = useMemo(() => {
    return payments.filter((item) => {
      if (activeFilter === "pending") return item.status === "pending";
      if (activeFilter === "approved") return item.status === "approved";
      if (activeFilter === "history") return item.status === "paid" || item.status === "denied";
      // "all" requests tab shows open requests (pending & approved); paid/denied requests are kept in History.
      return item.status === "pending" || item.status === "approved";
    });
  }, [payments, activeFilter]);

  async function doApprove() {
    if (!approveTarget) return;
    setBusy(true);
    const target = approveTarget;
    upsertPayment({
      ...target,
      status: "approved",
      approved_by: profile?.id ?? null,
      approver_name: profile?.full_name ?? "Director",
    });
    try {
      const updated = await approvePayment(target.id);
      upsertPayment({
        ...updated,
        approver_name: profile?.full_name ?? updated.approver_name,
      });
      setApproveTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
      void reload();
    } finally {
      setBusy(false);
    }
  }

  async function doMarkPaid(paymentMode?: PaymentMode, reference?: string) {
    if (!markPaidTarget) return;
    setBusy(true);
    const target = markPaidTarget;
    upsertPayment({
      ...target,
      status: "paid",
      paid_by: profile?.id ?? null,
      payer_name: profile?.full_name ?? "Accounts",
      payment_mode: paymentMode ?? "NEFT",
      payment_reference: reference ?? null,
    });
    try {
      const updated = await markPaymentPaid(target.id, paymentMode, reference);
      upsertPayment({
        ...updated,
        payer_name: profile?.full_name ?? updated.payer_name,
      });
      setMarkPaidTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
      void reload();
    } finally {
      setBusy(false);
    }
  }

  async function doDeny(reason: string) {
    if (!denyTarget) return;
    setBusy(true);
    try {
      const updated = await denyPayment(denyTarget.id, reason);
      upsertPayment({
        ...updated,
        denier_name: profile?.full_name ?? updated.denier_name,
      });
      setDenyTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function doEdit(input: EditPaymentInput) {
    if (!editTarget) return;
    setBusy(true);
    try {
      const prior = editTarget.status;
      const updated = await editUnpaidPayment({
        paymentId: editTarget.id,
        party: input.party,
        amount: input.amount,
        dueDate: input.dueDate,
        priorStatus: prior,
      });
      upsertPayment(
        prior === "denied"
          ? { ...updated, approver_name: null, denier_name: null }
          : updated
      );
      setEditTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }


  if (loading && payments.length === 0) {
    return <PageLoading label="Loading payments..." />;
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* 1. TOP 2 STAT BARS (Pending for Approval & Pending for Payment) */}
      <PaymentTotals
        payments={payments}
        activeFilter={activeFilter}
        onSelectFilter={(filterMode) => setActiveFilter(filterMode)}
      />

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            void reload();
          }}
        />
      ) : null}

      {/* 2. SINGLE PAGE CONTROL BAR (+ Payment Request & Filters) */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeFilter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            All Requests
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("pending")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeFilter === "pending"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Pending
          </button>

          <button
            type="button"
            onClick={() => setActiveFilter("approved")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeFilter === "approved"
                ? "bg-indigo-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            Approved
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter("history")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              activeFilter === "history"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            History
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAddDrawer(!showAddDrawer)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs shrink-0 flex items-center gap-1.5"
        >
          <span>+ Payment Request</span>
        </button>
      </div>

      {/* INLINE ADD REQUEST DRAWER */}
      {showAddDrawer && (
        <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-md space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">
              New Payment Request
            </h2>
            <button
              type="button"
              onClick={() => setShowAddDrawer(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600"
            >
              ✕ Close
            </button>
          </div>
          <AddPaymentForm />
        </div>
      )}

      {/* 3. UNIFIED EXPRESS STREAM */}
      <section>
        {filteredPayments.length === 0 ? (
          <EmptyState text="No payments found for this view." />
        ) : activeFilter === "history" ? (
          <HistoryWeekList
            payments={filteredPayments}
            role={role}
            onSelect={setDetailTarget}
            onEdit={canEdit ? setEditTarget : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                role={role}
                onSelect={setDetailTarget}
                onApprove={userCanApprove ? setApproveTarget : undefined}
                onDeny={userCanApprove ? setDenyTarget : undefined}
                onMarkPaid={userCanMarkPaid ? setMarkPaidTarget : undefined}
                onEdit={canEdit ? setEditTarget : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* Payment Detail & Audit Timeline Drawer */}
      <PaymentDetailDrawer
        payment={detailTarget}
        role={role}
        onClose={() => setDetailTarget(null)}
        onApprove={userCanApprove ? setApproveTarget : undefined}
        onDeny={userCanApprove ? setDenyTarget : undefined}
        onMarkPaid={userCanMarkPaid ? setMarkPaidTarget : undefined}
        onEdit={canEdit ? setEditTarget : undefined}
      />

      <ApproveDialog
        open={Boolean(approveTarget)}
        target={approveTarget}
        loading={busy}
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => void doApprove()}
      />
      <MarkPaidDialog
        open={Boolean(markPaidTarget)}
        target={markPaidTarget}
        loading={busy}
        onCancel={() => setMarkPaidTarget(null)}
        onConfirm={(mode, ref) => void doMarkPaid(mode, ref)}
      />
      <DenyDialog
        open={Boolean(denyTarget)}
        loading={busy}
        onCancel={() => setDenyTarget(null)}
        onConfirm={(reason) => void doDeny(reason)}
      />
      <CorrectPaymentDialog
        open={Boolean(editTarget)}
        payment={editTarget}
        loading={busy}
        onCancel={() => setEditTarget(null)}
        onConfirm={(input) => void doEdit(input)}
      />
    </div>
  );
}

