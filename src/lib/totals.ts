import type { Payment } from "@/types/database";
import { isOverdue } from "@/lib/format";

export type PaymentTotals = {
  pendingCount: number;
  pendingSum: number;
  outstandingCount: number;
  outstandingSum: number;
  overdueCount: number;
  overdueSum: number;
  paidCount: number;
  paidSum: number;
  deniedCount: number;
  deniedSum: number;
};

function amountOf(p: Payment): number {
  const n = typeof p.amount === "string" ? Number(p.amount) : p.amount;
  return Number.isFinite(n) ? n : 0;
}

/** Live totals from the current payments list (updates with Realtime reloads). */
export function computeTotals(payments: Payment[]): PaymentTotals {
  const t: PaymentTotals = {
    pendingCount: 0,
    pendingSum: 0,
    outstandingCount: 0,
    outstandingSum: 0,
    overdueCount: 0,
    overdueSum: 0,
    paidCount: 0,
    paidSum: 0,
    deniedCount: 0,
    deniedSum: 0,
  };

  for (const p of payments) {
    const amt = amountOf(p);
    switch (p.status) {
      case "pending":
        t.pendingCount += 1;
        t.pendingSum += amt;
        break;
      case "approved":
        t.outstandingCount += 1;
        t.outstandingSum += amt;
        if (isOverdue(p.status, p.due_date)) {
          t.overdueCount += 1;
          t.overdueSum += amt;
        }
        break;
      case "paid":
        t.paidCount += 1;
        t.paidSum += amt;
        break;
      case "denied":
        t.deniedCount += 1;
        t.deniedSum += amt;
        break;
    }
  }

  return t;
}
