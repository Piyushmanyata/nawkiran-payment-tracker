"use client";

import { useMemo } from "react";
import type { Payment } from "@/types/database";
import { computeTotals } from "@/lib/totals";
import { formatInr } from "@/lib/format";

export function PaymentTotals({ payments }: { payments: Payment[] }) {
  const t = useMemo(() => computeTotals(payments), [payments]);

  const tiles = [
    {
      key: "pending",
      label: "Waiting",
      count: t.pendingCount,
      sum: t.pendingSum,
      className: "bg-sky-50 text-sky-950 ring-sky-100",
    },
    {
      key: "outstanding",
      label: "Outstanding",
      count: t.outstandingCount,
      sum: t.outstandingSum,
      className: "bg-violet-50 text-violet-950 ring-violet-100",
    },
    {
      key: "overdue",
      label: "Overdue",
      count: t.overdueCount,
      sum: t.overdueSum,
      className: "bg-amber-50 text-amber-950 ring-amber-100",
    },
    {
      key: "paid",
      label: "Paid",
      count: t.paidCount,
      sum: t.paidSum,
      className: "bg-emerald-50 text-emerald-950 ring-emerald-100",
    },
  ] as const;

  return (
    <section aria-label="Payment totals" className="grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={`rounded-2xl p-3.5 ring-1 ${tile.className}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
            {tile.label}
          </p>
          <p className="mt-1 text-lg font-bold leading-tight tabular-nums">
            {formatInr(tile.sum)}
          </p>
          <p className="mt-0.5 text-xs font-medium opacity-70">
            {tile.count} {tile.count === 1 ? "payment" : "payments"}
          </p>
        </div>
      ))}
    </section>
  );
}
