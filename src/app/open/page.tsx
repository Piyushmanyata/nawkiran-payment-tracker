"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { ApproveDialog } from "@/components/ApproveDialog";
import { DenyDialog } from "@/components/DenyDialog";
import { MarkPaidDialog } from "@/components/MarkPaidDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageLoading } from "@/components/PageLoading";
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
  const showOutstanding =
    canMarkPaid(role) || canApprove(role) || role === "accounts";
  const outstandingMarkPaid = canMarkPaid(role);
  const employeePending = role === "employee";

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
    return <PageLoading label="Loading payments..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Open</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Pending approvals and outstanding payouts
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
              <PaymentCard key={p.id} payment={p} role={role} />
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
