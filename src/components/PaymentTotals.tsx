"use client";

import { memo, useMemo } from "react";
import type { Payment } from "@/types/database";
import { computeTotals } from "@/lib/totals";
import { formatInr } from "@/lib/format";

export type PaymentFilterMode = "all" | "pending" | "approved" | "history";

interface PaymentTotalsProps {
  payments: Payment[];
  activeFilter?: PaymentFilterMode;
  onSelectFilter?: (filter: PaymentFilterMode) => void;
}

interface StatTileProps {
  title: string;
  sum: number;
  count: number;
  active: boolean;
  colorTheme: "amber" | "blue";
  onClick: () => void;
}

function StatTile({ title, sum, count, active, colorTheme, onClick }: StatTileProps) {
  const isAmber = colorTheme === "amber";
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-2xl p-3.5 border transition ${
        active
          ? isAmber
            ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/40"
            : "bg-blue-50 border-blue-300 ring-2 ring-blue-400/40"
          : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
      }`}
    >
      <p
        className={`text-[11px] font-extrabold uppercase tracking-wider ${
          isAmber ? "text-amber-700" : "text-blue-700"
        }`}
      >
        {title}
      </p>
      <p className="text-xl font-black text-slate-900 mt-1 tabular-nums">
        {formatInr(sum)}
      </p>
      <p className="text-[11px] font-bold text-slate-500 mt-0.5">
        {count} {count === 1 ? "payment" : "payments"}
      </p>
    </div>
  );
}

function PaymentTotalsInner({ payments, activeFilter, onSelectFilter }: PaymentTotalsProps) {
  const totals = useMemo(() => computeTotals(payments), [payments]);

  return (
    <section aria-label="Payment totals summary" className="grid grid-cols-2 gap-3">
      <StatTile
        title="Pending for Approval"
        sum={totals.pendingSum}
        count={totals.pendingCount}
        active={activeFilter === "pending"}
        colorTheme="amber"
        onClick={() => onSelectFilter?.(activeFilter === "pending" ? "all" : "pending")}
      />
      <StatTile
        title="Pending for Payment"
        sum={totals.outstandingSum}
        count={totals.outstandingCount}
        active={activeFilter === "approved"}
        colorTheme="blue"
        onClick={() => onSelectFilter?.(activeFilter === "approved" ? "all" : "approved")}
      />
    </section>
  );
}

export const PaymentTotals = memo(PaymentTotalsInner);

