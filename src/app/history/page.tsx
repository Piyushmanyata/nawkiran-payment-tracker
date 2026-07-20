"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { LoadingButton } from "@/components/LoadingButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageLoading } from "@/components/PageLoading";
import { Modal } from "@/components/Modal";
import { CorrectPaymentDialog } from "@/components/CorrectPaymentDialog";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";
import { adminDeletePayment, editUnpaidPayment } from "@/lib/payments";
import { userMessageFromError } from "@/lib/errors";
import { canDeleteHistory, canEditPayment } from "@/lib/roles";
import { formatInr } from "@/lib/format";
import { fieldClass } from "@/lib/ui";
import type { Payment } from "@/types/database";

type Filter = "all" | "paid" | "denied";

export default function HistoryPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const {
    payments,
    loading,
    error,
    setError,
    reload,
    upsertPayment,
    removePayment,
  } = usePaymentsLive();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [editTarget, setEditTarget] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = canEditPayment(role);

  const history = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments
      .filter((p) => p.status === "paid" || p.status === "denied")
      .filter((p) => (filter === "all" ? true : p.status === filter))
      .filter((p) => (q ? p.party.toLowerCase().includes(q) : true));
  }, [payments, query, filter]);

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

  async function doEdit(input: {
    party: string;
    amount: number;
    dueDate: string | null;
  }) {
    if (!editTarget) return;
    setBusy(true);
    try {
      const updated = await editUnpaidPayment({
        paymentId: editTarget.id,
        party: input.party,
        amount: input.amount,
        dueDate: input.dueDate,
        priorStatus: "denied",
      });
      upsertPayment({
        ...updated,
        approver_name: null,
        denier_name: null,
      });
      setEditTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PageLoading label="Loading history..." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          History
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Paid and denied payments
          {canEdit ? " · denied items can be corrected and resubmitted" : ""}
        </p>
      </div>

      <PaymentTotals payments={payments} />

      {canDeleteHistory(role) ? (
        <p className="text-xs text-slate-500">
          As admin you can remove paid or denied items while retaining their audit trail.
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Search by party</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by party"
          className={fieldClass}
        />
      </label>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter history">
        {(
          [
            ["all", "All"],
            ["paid", "Paid"],
            ["denied", "Denied"],
          ] as const
        ).map(([value, label]) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            void reload();
          }}
        />
      ) : null}

      {history.length === 0 ? (
        <EmptyState
          text={
            query.trim() || filter !== "all"
              ? "No matching history."
              : "No history yet."
          }
        />
      ) : (
        <div className="space-y-3">
          {history.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              role={role}
              onEdit={
                p.status === "denied" && canEdit ? setEditTarget : undefined
              }
              onDelete={canDeleteHistory(role) ? setDeleteTarget : undefined}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        titleId="delete-title"
        title="Remove from history?"
        onClose={() => setDeleteTarget(null)}
        disableClose={busy}
      >
        <p className="mt-2 text-base text-slate-700">
          Remove {formatInr(deleteTarget?.amount ?? 0)} for{" "}
          {deleteTarget?.party} from the active history? Its audit record will be retained.
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
