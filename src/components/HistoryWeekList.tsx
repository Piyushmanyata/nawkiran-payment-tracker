"use client";

import { memo, useCallback, useMemo, useState } from "react";
import type { Payment, UserRole } from "@/types/database";
import { PaymentCard } from "@/components/PaymentCard";
import { groupHistoryByWeek } from "@/lib/history-weeks";
import { formatInr } from "@/lib/format";
import { canDeleteHistory, canEditPayment } from "@/lib/roles";

function HistoryWeekListInner({
  payments,
  role,
  onEdit,
  onDelete,
  /** When searching, expand every group that has matches. */
  forceExpandAll = false,
}: {
  payments: Payment[];
  role: UserRole | null;
  onEdit?: (p: Payment) => void;
  onDelete?: (p: Payment) => void;
  forceExpandAll?: boolean;
}) {
  const groups = useMemo(() => groupHistoryByWeek(payments), [payments]);
  /** Explicit opens only — everything starts collapsed until the user taps. */
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const isOpen = useCallback(
    (key: string) => {
      if (forceExpandAll) return true;
      return openKeys[key] === true;
    },
    [forceExpandAll, openKeys]
  );

  const toggle = useCallback((key: string) => {
    setOpenKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const open = isOpen(g.key);
        const panelId = `week-panel-${g.key}`;
        return (
          <section
            key={g.key}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <h2 className="sr-only">{g.label}</h2>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(g.key)}
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
                className="space-y-3 border-t border-slate-100 px-3 py-3"
              >
                {g.payments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    payment={p}
                    role={role}
                    onEdit={
                      p.status === "denied" && canEditPayment(role, p)
                        ? onEdit
                        : undefined
                    }
                    onDelete={canDeleteHistory(role) ? onDelete : undefined}
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
