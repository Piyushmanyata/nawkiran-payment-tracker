"use client";

import { useEffect, useMemo, useState } from "react";
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
  adminDeletePayment,
  approvePayment,
  denyPayment,
  editUnpaidPayment,
  isHistoryPayment,
  isOpenPayment,
  markPaymentPaid,
  maybePurgeOldHistory,
  needsMyAction,
  withdrawPayment,
} from "@/lib/payments";
import { usePayments } from "@/components/PaymentsProvider";
import { userMessageFromError } from "@/lib/errors";
import { canApprove, canDeleteHistory, canEditPayment, canMarkPaid } from "@/lib/roles";
import { formatInr } from "@/lib/format";
import { LoadingButton } from "@/components/LoadingButton";
import type { EditPaymentInput, Payment, PaymentMode } from "@/types/database";

const Modal = dynamic(() =>
  import("@/components/Modal").then((mod) => mod.Modal)
);
const ApproveDialog = dynamic(() =>
  import("@/components/ApproveDialog").then((mod) => mod.ApproveDialog)
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

/** [filter, label, active background] — one row per primary filter chip. */
const FILTER_CHIPS: ReadonlyArray<readonly [PaymentFilterMode, string, string]> = [
  ["all", "Open", "bg-slate-900"],
  ["pending", "Pending", "bg-amber-600"],
  ["approved", "Approved", "bg-indigo-600"],
  ["history", "History", "bg-emerald-600"],
];

export default function OpenPage() {
  const searchParams = useSearchParams();
  const actionParam = searchParams.get("action");
  const filterParam = searchParams.get("filter") as PaymentFilterMode | null;

  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const userId = profile?.id ?? null;
  const {
    payments,
    loading,
    error,
    setError,
    reload,
    upsertPayment,
    removePayment,
  } = usePayments();

  const [busy, setBusy] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(actionParam === "add");
  const [activeFilter, setActiveFilter] = useState<PaymentFilterMode>(filterParam || "all");
  const [searchQuery, setSearchQuery] = useState("");

  const [detailTarget, setDetailTarget] = useState<Payment | null>(null);
  const [approveTarget, setApproveTarget] = useState<Payment | null>(null);
  const [denyTarget, setDenyTarget] = useState<Payment | null>(null);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<Payment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);

  const canEdit = canEditPayment(role);
  const userCanApprove = canApprove(role);
  const userCanMarkPaid = canMarkPaid(role);
  const userCanDelete = canDeleteHistory(role);

  useEffect(() => {
    if (role) {
      void maybePurgeOldHistory();
    }
  }, [role]);

  const matchesSearch = (item: Payment, q: string) => {
    if (!q) return true;
    const term = q.toLowerCase();
    return (
      item.party.toLowerCase().includes(term) ||
      String(item.amount).includes(term) ||
      (item.purpose && item.purpose.toLowerCase().includes(term)) ||
      (item.payment_reference && item.payment_reference.toLowerCase().includes(term)) ||
      (item.payment_mode && item.payment_mode.toLowerCase().includes(term)) ||
      (item.requester_name && item.requester_name.toLowerCase().includes(term)) ||
      (item.denial_reason && item.denial_reason.toLowerCase().includes(term))
    );
  };

  // Filtered Payments Stream for Single Page Hub.
  // Denials you own sort to the top of Open — they are the only rows here that
  // are blocked on *you*.
  const filteredPayments = useMemo(() => {
    const q = searchQuery.trim();
    const rows = payments.filter((item) => {
      let matchesStatus = false;
      if (activeFilter === "pending") matchesStatus = item.status === "pending";
      else if (activeFilter === "approved") matchesStatus = item.status === "approved";
      else if (activeFilter === "history") matchesStatus = isHistoryPayment(item, userId);
      else matchesStatus = isOpenPayment(item, userId);

      if (!matchesStatus) return false;
      return matchesSearch(item, q);
    });
    if (activeFilter !== "all") return rows;
    return rows
      .slice()
      .sort(
        (a, b) =>
          Number(needsMyAction(b, userId)) - Number(needsMyAction(a, userId))
      );
  }, [payments, activeFilter, searchQuery, userId]);

  const actionNeededCount = useMemo(
    () => payments.filter((item) => needsMyAction(item, userId)).length,
    [payments, userId]
  );

  const matchingHistoryCount = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || activeFilter === "history") return 0;
    return payments.filter(
      (item) => isHistoryPayment(item, userId) && matchesSearch(item, q)
    ).length;
  }, [payments, searchQuery, activeFilter, userId]);

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

  async function doMarkPaid(target: Payment) {
    const DEFAULT_PAYMENT_MODE: PaymentMode = "NEFT";
    setBusy(true);
    if (detailTarget?.id === target.id) {
      setDetailTarget(null);
    }
    upsertPayment({
      ...target,
      status: "paid",
      paid_by: profile?.id ?? null,
      payer_name: profile?.full_name ?? "Accounts",
      payment_mode: DEFAULT_PAYMENT_MODE,
      payment_reference: null,
    });
    try {
      const updated = await markPaymentPaid(target.id, DEFAULT_PAYMENT_MODE);
      upsertPayment({
        ...updated,
        payer_name: profile?.full_name ?? updated.payer_name,
      });
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

  async function doWithdraw() {
    if (!withdrawTarget) return;
    setBusy(true);
    const target = withdrawTarget;
    if (detailTarget?.id === target.id) setDetailTarget(null);
    try {
      const updated = await withdrawPayment(target.id);
      upsertPayment(updated);
      setWithdrawTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const id = deleteTarget.id;
      await adminDeletePayment(id);
      removePayment(id);
      setDeleteTarget(null);
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

      {/* SEARCH BAR & CONTROL BAR */}
      <div className="space-y-2 pt-1">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requests or history..."
              className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <svg
              className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowAddDrawer(!showAddDrawer)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs shrink-0 flex items-center justify-center gap-1.5"
          >
            <span>+ Payment Request</span>
          </button>
        </div>

        {matchingHistoryCount > 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-2.5 flex items-center justify-between text-xs text-blue-900 font-medium">
            <span>
              Found <strong className="font-bold">{matchingHistoryCount}</strong> matching record{matchingHistoryCount === 1 ? "" : "s"} in History
            </span>
            <button
              type="button"
              onClick={() => setActiveFilter("history")}
              className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700 transition"
            >
              View in History →
            </button>
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label="Payment filters"
          className="flex gap-1.5 overflow-x-auto pb-1"
        >
          {FILTER_CHIPS.map(([mode, label, activeClass]) => {
            const active = activeFilter === mode;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(mode)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? `${activeClass} text-white shadow-xs`
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
                {mode === "all" && actionNeededCount > 0 ? (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                      active ? "bg-white/20 text-white" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {actionNeededCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
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
          <EmptyState
            text={
              searchQuery.trim()
                ? `No ${activeFilter === "history" ? "history" : "open"} records match "${searchQuery.trim()}".`
                : activeFilter === "history"
                  ? "Nothing settled yet. Paid and withdrawn requests land here."
                  : activeFilter === "pending"
                    ? "No requests are waiting for approval."
                    : activeFilter === "approved"
                      ? "No approved requests are waiting for payout."
                      : "All clear — nothing open right now."
            }
          />
        ) : activeFilter === "history" ? (
          <HistoryWeekList
            payments={filteredPayments}
            role={role}
            userId={profile?.id}
            onSelect={setDetailTarget}
            onEdit={canEdit ? setEditTarget : undefined}
            onDelete={userCanDelete ? setDeleteTarget : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredPayments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
                role={role}
                userId={profile?.id}
                onSelect={setDetailTarget}
                onApprove={userCanApprove ? setApproveTarget : undefined}
                onDeny={userCanApprove ? setDenyTarget : undefined}
                onMarkPaid={userCanMarkPaid ? (p) => void doMarkPaid(p) : undefined}
                onEdit={canEdit ? setEditTarget : undefined}
                onWithdraw={setWithdrawTarget}
              />
            ))}
          </div>
        )}
      </section>

      {/* Payment Detail & Audit Timeline Drawer */}
      <PaymentDetailDrawer
        payment={detailTarget}
        role={role}
        userId={profile?.id}
        onClose={() => setDetailTarget(null)}
        onApprove={userCanApprove ? setApproveTarget : undefined}
        onDeny={userCanApprove ? setDenyTarget : undefined}
        onMarkPaid={userCanMarkPaid ? (p) => void doMarkPaid(p) : undefined}
        onEdit={canEdit ? setEditTarget : undefined}
        onWithdraw={setWithdrawTarget}
        onDelete={userCanDelete ? setDeleteTarget : undefined}
      />

      <ApproveDialog
        open={Boolean(approveTarget)}
        target={approveTarget}
        loading={busy}
        onCancel={() => setApproveTarget(null)}
        onConfirm={() => void doApprove()}
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

      <Modal
        open={Boolean(withdrawTarget)}
        titleId="withdraw-title"
        title="Withdraw this request?"
        onClose={() => setWithdrawTarget(null)}
        disableClose={busy}
      >
        <p className="mt-2 text-base text-slate-700">
          {formatInr(withdrawTarget?.amount ?? 0)} for {withdrawTarget?.party}{" "}
          will move to History and will not be paid. Correct and resubmit
          instead if the request is still needed.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton
            variant="secondary"
            disabled={busy}
            onClick={() => setWithdrawTarget(null)}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            variant="danger"
            loading={busy}
            loadingText="Withdrawing..."
            onClick={() => void doWithdraw()}
          >
            Withdraw
          </LoadingButton>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        titleId="delete-title"
        title="Remove from history?"
        onClose={() => setDeleteTarget(null)}
        disableClose={busy}
      >
        <p className="mt-2 text-base text-slate-700">
          Remove {formatInr(deleteTarget?.amount ?? 0)} for{" "}
          {deleteTarget?.party} from the active history? Its audit record will
          be retained.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton
            variant="secondary"
            disabled={busy}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            variant="danger"
            loading={busy}
            loadingText="Removing..."
            onClick={() => void doDelete()}
          >
            Remove
          </LoadingButton>
        </div>
      </Modal>
    </div>
  );
}

