import type { Payment } from "@/types/database";

export type HistoryDayGroup = {
  /** Stable key: local calendar day YYYY-MM-DD. */
  key: string;
  label: string;
  rangeLabel: string;
  isToday: boolean;
  payments: Payment[];
  count: number;
  sum: number;
};

/** Instant used to place a history row (paid_at / denied_at). */
export function historyInstant(p: Payment): Date {
  const raw =
    p.status === "paid"
      ? p.paid_at
      : p.status === "denied"
        ? p.denied_at
        : null;
  const s = raw || p.updated_at || p.requested_at;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function weekday(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

function amountOf(p: Payment): number {
  const n = typeof p.amount === "string" ? Number(p.amount) : p.amount;
  return Number.isFinite(n) ? n : 0;
}

function dayLabel(day: Date, today: Date): string {
  const key = toIsoDate(day);
  if (key === toIsoDate(today)) return "Today";
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (key === toIsoDate(yest)) return "Yesterday";
  return formatDay(day);
}

/**
 * Group history payments by local calendar day, newest first.
 * Within each day, newest first.
 */
export function groupHistoryByDay(
  payments: Payment[],
  now: Date = new Date()
): HistoryDayGroup[] {
  const today = startOfLocalDay(now);
  const buckets = new Map<string, Payment[]>();

  for (const p of payments) {
    const key = toIsoDate(historyInstant(p));
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const keys = [...buckets.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  const todayKey = toIsoDate(today);

  return keys.map((key) => {
    const day = new Date(key + "T12:00:00");
    const rows = (buckets.get(key) ?? []).slice().sort((a, b) => {
      return historyInstant(b).getTime() - historyInstant(a).getTime();
    });
    let sum = 0;
    for (const p of rows) sum += amountOf(p);
    const isToday = key === todayKey;
    return {
      key,
      label: dayLabel(day, today),
      rangeLabel: isToday ? formatDay(day) : weekday(day),
      isToday,
      payments: rows,
      count: rows.length,
      sum,
    };
  });
}
