"use client";

import { memo, useMemo } from "react";
import type { Payment } from "@/types/database";
import { computeTotals } from "@/lib/totals";
import { formatInr } from "@/lib/format";

const TILE_CONFIGS = [
  {
    key: "pending",
    label: "Waiting",
    countKey: "pendingCount",
    sumKey: "pendingSum",
    className: "bg-sky-50 text-sky-950 ring-sky-100",
  },
  {
    key: "outstanding",
    label: "Outstanding",
    countKey: "outstandingCount",
    sumKey: "outstandingSum",
    className: "bg-violet-50 text-violet-950 ring-violet-100",
  },
  {
    key: "overdue",
    label: "Overdue",
    countKey: "overdueCount",
    sumKey: "overdueSum",
    className: "bg-amber-50 text-amber-950 ring-amber-100",
  },
  {
    key: "paid",
    label: "Paid",
    countKey: "paidCount",
    sumKey: "paidSum",
    className: "bg-emerald-50 text-emerald-950 ring-emerald-100",
  },
] as const;

function PaymentTotalsInner({ payments }: { payments: Payment[] }) {
  const t = useMemo(() => computeTotals(payments), [payments]);

  return (
    <section aria-label="Payment totals" className="grid grid-cols-2 gap-2.5">
      {TILE_CONFIGS.map((tile) => {
        const count = t[tile.countKey];
        const sum = t[tile.sumKey];
        return (
          <div
            key={tile.key}
            className={`rounded-2xl p-3.5 ring-1 ${tile.className}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
              {tile.label}
            </p>
            <p className="mt-1 text-lg font-bold leading-tight tabular-nums">
              {formatInr(sum)}
            </p>
            <p className="mt-0.5 text-xs font-medium opacity-70">
              {count} {count === 1 ? "payment" : "payments"}
            </p>
          </div>
        );
      })}
    </section>
  );
}

export const PaymentTotals = memo(PaymentTotalsInner);
