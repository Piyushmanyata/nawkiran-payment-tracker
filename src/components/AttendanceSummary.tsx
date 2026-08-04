"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { PageLoading } from "@/components/PageLoading";
import { summariseDay, summariseMonth } from "@/lib/attendance";
import {
  KIND_LABELS,
  REASON_LABELS,
  fetchAttendanceDays,
  fetchAttendanceEntries,
  fetchAttendanceEvents,
  fetchWorkersAll,
} from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { formatDateTime, todayLocalIso } from "@/lib/format";
import { fieldClass } from "@/lib/ui";
import type {
  AttendanceDay,
  AttendanceEntry,
  AttendanceEvent,
  Company,
  Shift,
  Worker,
} from "@/types/database";

const COMPANIES: Company[] = ["NKPL", "APTUS"];
const SHIFTS: Shift[] = ["day", "night"];
const EVENT_LABELS: Record<AttendanceEvent["action"], string> = {
  entry_created: "Entry added",
  entry_updated: "Entry edited",
  entry_deleted: "Entry removed",
  shift_confirmed: "Shift confirmed",
  shift_reopened: "Shift reopened",
};

type Tab = "today" | "month";

function monthPrefixFromDate(iso: string): string {
  return iso.slice(0, 7);
}

export function AttendanceSummary() {
  const [tab, setTab] = useState<Tab>("today");
  const [workDate, setWorkDate] = useState(() => todayLocalIso());
  const [month, setMonth] = useState(() => monthPrefixFromDate(todayLocalIso()));
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (tab === "today") {
        const [d, w] = await Promise.all([
          fetchAttendanceDays({ workDate }),
          fetchWorkersAll(),
        ]);
        setDays(d);
        setWorkers(w);
        const dayIds = d.map((x) => x.id);
        const [entryRows, eventRows] = await Promise.all([
          fetchAttendanceEntries(dayIds),
          fetchAttendanceEvents(dayIds),
        ]);
        setEntries(entryRows);
        setEvents(eventRows);
      } else {
        const [d, w] = await Promise.all([
          fetchAttendanceDays({ monthPrefix: month }),
          fetchWorkersAll(),
        ]);
        setDays(d);
        setWorkers(w);
        setEntries(await fetchAttendanceEntries(d.map((x) => x.id)));
        setEvents([]);
      }
      setError(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, workDate, month]);

  useEffect(() => {
    // Defer so the effect body never sets state inline (house pattern).
    const kick = window.setTimeout(() => void load(), 0);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const entriesByDay = useMemo(() => {
    const m = new Map<string, AttendanceEntry[]>();
    for (const e of entries) {
      const list = m.get(e.attendance_day_id) ?? [];
      list.push(e);
      m.set(e.attendance_day_id, list);
    }
    return m;
  }, [entries]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, AttendanceEvent[]>();
    for (const event of events) {
      const list = m.get(event.attendance_day_id) ?? [];
      list.push(event);
      m.set(event.attendance_day_id, list);
    }
    return m;
  }, [events]);

  const monthRows = useMemo(() => {
    if (tab !== "month") return [];
    return summariseMonth({ days, entries, workers });
  }, [tab, days, entries, workers]);

  if (loading) return <PageLoading />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Attendance</h1>
          <p className="text-sm font-medium text-slate-500">
            Who was absent, and why
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {(
            [
              ["today", "Today"],
              ["month", "Month"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-10 rounded-lg px-4 text-sm font-bold transition ${
                tab === id
                  ? "bg-white text-blue-600 shadow-xs"
                  : "text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <div className="flex flex-wrap items-end gap-3">
        {tab === "today" ? (
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Date
            </span>
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className={`${fieldClass} py-2 text-sm`}
            />
          </label>
        ) : (
          <label className="block max-w-xs">
            <span className="mb-1 block text-xs font-semibold text-slate-500">
              Month
            </span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={`${fieldClass} py-2 text-sm`}
            />
          </label>
        )}
        <a
          href={`/api/attendance/export?month=${encodeURIComponent(
            tab === "month" ? month : workDate.slice(0, 7)
          )}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
        >
          Export .xlsx
        </a>
      </div>

      {tab === "today" ? (
        <div className="space-y-6">
          {COMPANIES.map((company) => (
            <section key={company} className="space-y-3">
              <h2 className="text-base font-extrabold text-slate-900">
                {company}
              </h2>
              {SHIFTS.map((shift) => {
                const day =
                  days.find(
                    (d) => d.company === company && d.shift === shift
                  ) ?? null;
                const dayEntries = day
                  ? (entriesByDay.get(day.id) ?? [])
                  : [];
                const dayEvents = day ? (eventsByDay.get(day.id) ?? []) : [];
                const summary = summariseDay({
                  company,
                  workDate,
                  shift,
                  day,
                  entries: dayEntries,
                });
                return (
                  <div
                    key={shift}
                    className={`rounded-2xl border px-4 py-3 ${
                      summary.state === "not_submitted"
                        ? "border-amber-300 bg-amber-50/60"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-bold capitalize text-slate-800">
                        {shift} shift
                      </p>
                      <StateBadge state={summary.state} />
                    </div>
                    {summary.state === "not_submitted" ? (
                      <p className="text-sm font-medium text-amber-900">
                        Not submitted — supervisor has not confirmed this shift.
                      </p>
                    ) : summary.state === "confirmed_all_present" ? (
                      <p className="text-sm font-medium text-emerald-800">
                        Confirmed — nobody absent.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {dayEntries.map((e) => (
                          <li
                            key={e.id}
                            className="border-t border-slate-100 pt-2 text-sm first:border-0 first:pt-0"
                          >
                            <span className="font-bold text-slate-900">
                              {e.worker_name ?? "Worker"}
                            </span>
                            {e.worker_designation ? (
                              <span className="text-slate-500">
                                {" "}
                                · {e.worker_designation}
                              </span>
                            ) : null}
                            <div className="text-xs font-medium text-slate-600">
                              {KIND_LABELS[e.kind]}
                              {e.kind === "absent" && e.reason
                                ? ` · ${REASON_LABELS[e.reason]}`
                                : ""}
                              {e.kind === "absent"
                                ? e.informed
                                  ? " · Informed"
                                  : " · Did not inform"
                                : ""}
                              {e.kind === "lent_out" && e.lent_to_company
                                ? ` → ${e.lent_to_company}`
                                : ""}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {dayEvents.length > 0 ? (
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Admin audit
                        </p>
                        {dayEvents.map((event) => (
                          <p
                            key={event.id}
                            className="mt-1 text-xs font-medium text-slate-600"
                          >
                            {EVENT_LABELS[event.action]} by {event.actor_name ?? "Admin"} ·{" "}
                            {formatDateTime(event.created_at)}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      ) : monthRows.length === 0 ? (
        <EmptyState text="No exceptions recorded this month." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Worker</th>
                <th className="px-3 py-2">Co.</th>
                <th className="px-3 py-2">Absent</th>
                <th className="px-3 py-2">Informed</th>
                <th className="px-3 py-2">Uninformed</th>
                <th className="px-3 py-2">Off</th>
                <th className="px-3 py-2">Lent</th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map((r) => (
                <tr
                  key={r.workerId}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2 font-semibold text-slate-900">
                    {r.workerName}
                    {r.designation ? (
                      <span className="block text-xs font-medium text-slate-500">
                        {r.designation}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.company}</td>
                  <td className="px-3 py-2 font-bold text-slate-900">
                    {r.absenceCount}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.informedCount}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {r.uninformedCount}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{r.weeklyOffCount}</td>
                  <td className="px-3 py-2 text-slate-700">{r.lentOutCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StateBadge({
  state,
}: {
  state: "not_submitted" | "confirmed_all_present" | "confirmed";
}) {
  if (state === "not_submitted") {
    return (
      <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
        Not submitted
      </span>
    );
  }
  if (state === "confirmed_all_present") {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
        All present
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
      Confirmed
    </span>
  );
}
