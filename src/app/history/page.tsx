"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PaymentCard } from "@/components/PaymentCard";
import { PaymentTotals } from "@/components/PaymentTotals";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";

type Filter = "all" | "paid" | "denied";

export default function HistoryPage() {
  const { profile } = useAuth();
  const { payments, loading, error } = usePaymentsLive();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const history = useMemo(() => {
    const q = query.trim().toLowerCase();
    return payments
      .filter((p) => p.status === "paid" || p.status === "denied")
      .filter((p) => (filter === "all" ? true : p.status === filter))
      .filter((p) => (q ? p.party.toLowerCase().includes(q) : true));
  }, [payments, query, filter]);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading history...</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">History</h1>

      <PaymentTotals payments={payments} />

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
              role={profile?.role ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
