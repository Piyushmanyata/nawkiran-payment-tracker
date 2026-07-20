import type { Payment } from "@/types/database";

export type HistoryWeekGroup = {
  /** Stable key: ISO date of the Monday that starts the week (YYYY-MM-DD). */
  key: string;
  label: string;
  rangeLabel: string;
  payments: Payment[];
  count: number;
  sum: number;
};

/** Instant used to place a history row into a week (paid_at / denied_at). */
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

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function amountOf(p: Payment): number {
  const n = typeof p.amount === "string" ? Number(p.amount) : p.amount;
  return Number.isFinite(n) ? n : 0;
}

function weekLabel(monday: Date, now: Date): string {
  const thisMon = startOfWeekMonday(now);
  const lastMon = new Date(thisMon);
  lastMon.setDate(lastMon.getDate() - 7);
  if (toIsoDate(monday) === toIsoDate(thisMon)) return "This week";
  if (toIsoDate(monday) === toIsoDate(lastMon)) return "Last week";
  return `Week of ${formatDay(monday)}`;
}

/**
 * Group history payments into calendar weeks (Mon–Sun), newest first.
 * Within each week, newest first.
 */
export function groupHistoryByWeek(
  payments: Payment[],
  now: Date = new Date()
): HistoryWeekGroup[] {
  const buckets = new Map<string, Payment[]>();

  for (const p of payments) {
    const monday = startOfWeekMonday(historyInstant(p));
    const key = toIsoDate(monday);
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const keys = [...buckets.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  return keys.map((key) => {
    const monday = new Date(key + "T00:00:00");
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const rows = (buckets.get(key) ?? []).slice().sort((a, b) => {
      return historyInstant(b).getTime() - historyInstant(a).getTime();
    });
    let sum = 0;
    for (const p of rows) sum += amountOf(p);
    return {
      key,
      label: weekLabel(monday, now),
      rangeLabel: `${formatDay(monday)} – ${formatDay(sunday)}`,
      payments: rows,
      count: rows.length,
      sum,
    };
  });
}
