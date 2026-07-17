"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { ApproveDialog } from "@/components/ApproveDialog";
import { DenyDialog } from "@/components/DenyDialog";
import { MarkPaidDialog } from "@/components/MarkPaidDialog";
import {
  approvePayment,
  denyPayment,
  markPaymentPaid,
} from "@/lib/payments";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";
import { userMessageFromError } from "@/lib/errors";
import { canApprove, canMarkPaid } from "@/lib/roles";
import type { Payment } from "@/types/database";

export default function OpenPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const { payments, loading, error, setError, reload } = usePaymentsLive();
  const [busy, setBusy] = useState(false);

  const [approveTarget, setApproveTarget] = useState<Payment | null>(null);
  const [denyTarget, setDenyTarget] = useState<Payment | null>(null);
  const [paidTarget, setPaidTarget] = useState<Payment | null>(null);

  const pending = useMemo(
    () => payments.filter((p) => p.status === "pending"),
    [payments]
  );
  const outstanding = useMemo(
    () => payments.filter((p) => p.status === "approved"),
    [payments]
  );

  const showPending = canApprove(role);
  const showOutstanding = canMarkPaid(role) || canApprove(role) || role === "accounts";
  // Director sees outstanding read-only (no mark paid); employee marks paid
  const outstandingMarkPaid = canMarkPaid(role);

  async function doApprove() {
    if (!approveTarget) return;
    setBusy(true);
    try {
      await approvePayment(approveTarget.id);
      setApproveTarget(null);
      await reload();
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
      await denyPayment(denyTarget.id, reason);
      setDenyTarget(null);
      await reload();
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
      await markPaymentPaid(paidTarget.id);
      setPaidTarget(null);
      await reload();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading payments...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Open</h1>

      <PaymentTotals payments={payments} />

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {showPending ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Waiting for Approval
          </h2>
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
              />
            ))
          )}
        </section>
      ) : null}

      {/* Employees: show their pending requests without approve buttons */}
      {role === "employee" ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Waiting for Approval
          </h2>
          {pending.length === 0 ? (
            <EmptyState text="No payments waiting for approval." />
          ) : (
            pending.map((p) => (
              <PaymentCard key={p.id} payment={p} role={role} />
            ))
          )}
        </section>
      ) : null}

      {showOutstanding ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Outstanding
          </h2>
          {outstanding.length === 0 ? (
            <EmptyState text="No outstanding payments." />
          ) : (
            outstanding.map((p) => (
              <PaymentCard
                key={p.id}
                payment={p}
                role={role}
                onMarkPaid={outstandingMarkPaid ? setPaidTarget : undefined}
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
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}
