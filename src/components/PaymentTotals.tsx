"use client";

import { memo, useMemo } from "react";
import type { Payment } from "@/types/database";
import { computeTotals } from "@/lib/totals";
import { formatInr } from "@/lib/format";

interface PaymentTotalsProps {
  payments: Payment[];
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
}

function PaymentTotalsInner({ payments, activeFilter, onSelectFilter }: PaymentTotalsProps) {
  const t = useMemo(() => computeTotals(payments), [payments]);

  return (
    <section aria-label="Payment totals summary" className="grid grid-cols-2 gap-3">
      {/* BAR 1: PENDING FOR APPROVAL */}
      <div
        onClick={() => onSelectFilter?.(activeFilter === "pending" ? "all" : "pending")}
        className={`cursor-pointer rounded-2xl p-3.5 border transition ${
          activeFilter === "pending"
            ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400/40"
            : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
        }`}
      >
        <p className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">
          Pending for Approval
        </p>
        <p className="text-xl font-black text-slate-900 mt-1 tabular-nums">
          {formatInr(t.pendingSum)}
        </p>
        <p className="text-[11px] font-bold text-slate-500 mt-0.5">
          {t.pendingCount} {t.pendingCount === 1 ? "payment" : "payments"}
        </p>
      </div>

      {/* BAR 2: PENDING FOR PAYMENT */}
      <div
        onClick={() => onSelectFilter?.(activeFilter === "approved" ? "all" : "approved")}
        className={`cursor-pointer rounded-2xl p-3.5 border transition ${
          activeFilter === "approved"
            ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400/40"
            : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
        }`}
      >
        <p className="text-[11px] font-extrabold text-blue-700 uppercase tracking-wider">
          Pending for Payment
        </p>
        <p className="text-xl font-black text-slate-900 mt-1 tabular-nums">
          {formatInr(t.outstandingSum)}
        </p>
        <p className="text-[11px] font-bold text-slate-500 mt-0.5">
          {t.outstandingCount} {t.outstandingCount === 1 ? "payment" : "payments"}
        </p>
      </div>
    </section>
  );
}

export const PaymentTotals = memo(PaymentTotalsInner);
