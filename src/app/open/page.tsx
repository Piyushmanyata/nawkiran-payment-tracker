"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { ApproveDialog } from "@/components/ApproveDialog";
import { DenyDialog } from "@/components/DenyDialog";
import { MarkPaidDialog } from "@/components/MarkPaidDialog";
import { CorrectPaymentDialog } from "@/components/CorrectPaymentDialog";
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
import type { Payment } from "@/types/database";

export default function OpenPage() {
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

  const [approveTarget, setApproveTarget] = useState<Payment | null>(null);
  const [denyTarget, setDenyTarget] = useState<Payment | null>(null);
  const [paidTarget, setPaidTarget] = useState<Payment | null>(null);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);

  const canEdit = canEditPayment(role);

  // Single pass over payments
  const { pending, outstanding, correctableDenied } = useMemo(() => {
    const pendingList: Payment[] = [];
    const outstandingList: Payment[] = [];
    const correctable: Payment[] = [];
    for (const p of payments) {
      if (p.status === "pending") pendingList.push(p);
      else if (p.status === "approved") outstandingList.push(p);
      else if (p.status === "denied" && canEditPayment(role, p)) correctable.push(p);
    }
    return {
      pending: pendingList,
      outstanding: outstandingList,
      correctableDenied: correctable,
    };
  }, [payments, role]);

  const showPending = canApprove(role);
  const showOutstanding =
    canMarkPaid(role) || canApprove(role) || role === "accounts";
  const outstandingMarkPaid = canMarkPaid(role);
  const employeePending = role === "employee";

  async function doApprove() {
    if (!approveTarget) return;
    setBusy(true);
    try {
      const updated = await approvePayment(approveTarget.id);
      upsertPayment({
        ...updated,
        approver_name: profile?.full_name ?? updated.approver_name,
      });
      setApproveTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
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

  async function doMarkPaid() {
    if (!paidTarget) return;
    setBusy(true);
    try {
      const updated = await markPaymentPaid(paidTarget.id);
      upsertPayment({
        ...updated,
        payer_name: profile?.full_name ?? updated.payer_name,
      });
      setPaidTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function doEdit(input: {
    party: string;
    amount: number;
    dueDate: string | null;
  }) {
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

  if (loading) {
    return <PageLoading label="Loading payments..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Open</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Pending approvals, edits, and outstanding payouts
        </p>
      </div>

      <PaymentTotals payments={payments} />

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            void reload();
          }}
        />
      ) : null}

      {correctableDenied.length > 0 ? (
        <section className="space-y-3">
          <SectionHeading title="Needs correction" count={correctableDenied.length} />
          <p className="text-sm text-slate-600">
            These payments were denied. Fix the details using the denial reason,
            then resubmit for approval.
          </p>
          {correctableDenied.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              role={role}
              onEdit={setEditTarget}
            />
          ))}
        </section>
      ) : null}

      {showPending ? (
        <section className="space-y-3">
          <SectionHeading
            title="Waiting for approval"
            count={pending.length}
          />
          {pending.length === 0 ? (
            <EmptyState text="Nothing waiting for approval." />
          ) : (
            pending.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                role={role}
                onApprove={setApproveTarget}
                onDeny={setDenyTarget}
                onEdit={canEdit ? setEditTarget : undefined}
              />
            ))
          )}
        </section>
      ) : null}

      {employeePending ? (
        <section className="space-y-3">
          <SectionHeading
            title="Waiting for approval"
            count={pending.length}
          />
          {pending.length === 0 ? (
            <EmptyState text="No payments waiting for approval." />
          ) : (
            pending.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                role={role}
                onEdit={canEdit ? setEditTarget : undefined}
              />
            ))
          )}
        </section>
      ) : null}

      {showOutstanding ? (
        <section className="space-y-3">
          <SectionHeading title="Outstanding" count={outstanding.length} />
          {outstanding.length === 0 ? (
            <EmptyState text="No outstanding payments." />
          ) : (
            outstanding.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                role={role}
                onMarkPaid={outstandingMarkPaid ? setPaidTarget : undefined}
                onEdit={canEdit ? setEditTarget : undefined}
              />
            ))
          )}
        </section>
      ) : null}

      <ApproveDialog
        open={Boolean(approveTarget)}
        party={approveTarget?.party ?? ""}
        amount={approveTarget?.amount ?? 0}
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
      <MarkPaidDialog
        open={Boolean(paidTarget)}
        party={paidTarget?.party ?? ""}
        amount={paidTarget?.amount ?? 0}
        loading={busy}
        onCancel={() => setPaidTarget(null)}
        onConfirm={() => void doMarkPaid()}
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

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <span className="text-xs font-medium tabular-nums text-slate-400">
        {count}
      </span>
    </div>
  );
}
