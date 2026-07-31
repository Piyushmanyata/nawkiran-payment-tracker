"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Payment, UserRole } from "@/types/database";
import { PaymentCard } from "@/components/PaymentCard";
import { groupHistoryByDay } from "@/lib/history-weeks";
import { formatInr } from "@/lib/format";
import { canEditPayment } from "@/lib/roles";

function HistoryWeekListInner({
  payments,
  role,
  userId,
  onSelect,
  onEdit,
  /** When searching, expand every group that has matches. */
  forceExpandAll = false,
}: {
  payments: Payment[];
  role: UserRole | null;
  userId?: string | null;
  onSelect?: (p: Payment) => void;
  onEdit?: (p: Payment) => void;
  forceExpandAll?: boolean;
}) {
  const groups = useMemo(() => groupHistoryByDay(payments), [payments]);
  /** Explicit toggles; today starts open. */
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const isOpen = useCallback(
    (key: string, isToday: boolean) => {
      if (forceExpandAll) return true;
      if (openKeys[key] !== undefined) return openKeys[key] === true;
      return isToday;
    },
    [forceExpandAll, openKeys]
  );

  const toggle = useCallback((key: string, isToday: boolean) => {
    setOpenKeys((prev) => {
      const currently =
        prev[key] !== undefined ? prev[key] === true : isToday;
      return { ...prev, [key]: !currently };
    });
  }, []);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const open = isOpen(g.key, g.isToday);
        const panelId = `day-panel-${g.key}`;
        return (
          <section
            key={g.key}
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
              g.isToday ? "border-blue-200" : "border-slate-200"
            }`}
          >
            <h2 className="sr-only">{g.label}</h2>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(g.key, g.isToday)}
              className="flex w-full min-h-12 items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100"
            >
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition ${
                  open ? "rotate-90" : ""
                }`}
                aria-hidden
              >
                <ChevronIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-900">
                  {g.label}
                  {g.isToday ? (
                    <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      open
                    </span>
                  ) : null}
                </span>
                <span className="block text-xs text-slate-500">
                  {g.rangeLabel}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold tabular-nums text-slate-900">
                  {formatInr(g.sum)}
                </span>
                <span className="block text-xs font-medium tabular-nums text-slate-400">
                  {g.count} {g.count === 1 ? "payment" : "payments"}
                </span>
              </span>
            </button>

            {open ? (
              <div
                id={panelId}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-slate-100 px-3 py-3"
              >
                {g.payments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    payment={p}
                    role={role}
                    userId={userId}
                    onSelect={onSelect}
                    onEdit={
                      p.status === "denied" &&
                      canEditPayment(role, p, userId)
                        ? onEdit
                        : undefined
                    }
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export const HistoryWeekList = memo(HistoryWeekListInner);
