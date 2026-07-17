"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { LoadingButton } from "@/components/LoadingButton";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";
import { adminDeletePayment } from "@/lib/payments";
import { userMessageFromError } from "@/lib/errors";
import { canDeleteHistory } from "@/lib/roles";
import { formatInr } from "@/lib/format";
import type { Payment } from "@/types/database";

type Filter = "all" | "paid" | "denied";

export default function HistoryPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const { payments, loading, error, setError, reload } = usePaymentsLive();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

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
      await adminDeletePayment(deleteTarget.id);
      setDeleteTarget(null);
      await reload();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading history...</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>

      <PaymentTotals payments={payments} />

      {canDeleteHistory(role) ? (
        <p className="text-xs text-slate-500">
          As admin you can permanently delete paid or denied items from history.
        </p>
      ) : null}

      <label className="block">
        <span className="sr-only">Search by party</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by party"
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <div className="flex gap-2">
        {(
          [
            ["all", "All"],
            ["paid", "Paid"],
            ["denied", "Denied"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
              filter === value
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 ring-1 ring-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No history yet.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((p) => (
            <PaymentCard
              key={p.id}
              payment={p}
              role={role}
              onDelete={
                canDeleteHistory(role) ? setDeleteTarget : undefined
              }
            />
          ))}
        </div>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 id="delete-title" className="text-lg font-bold text-slate-900">
              Delete from history?
            </h2>
            <p className="mt-2 text-base text-slate-700">
              Permanently remove {formatInr(deleteTarget.amount)} for{" "}
              {deleteTarget.party}? This cannot be undone.
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
                loadingText="Deleting..."
                onClick={() => void doDelete()}
              >
                Delete
              </LoadingButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
