"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AbsenceEntryForm } from "@/components/AbsenceEntryForm";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingButton } from "@/components/LoadingButton";
import { PageLoading } from "@/components/PageLoading";
import {
  getAttendanceDayActions,
  summariseDay,
  summariseMonth,
} from "@/lib/attendance";
import {
  REASON_LABELS,
  addWorker,
  confirmAttendanceShift,
  deleteAttendanceEntry,
  fetchAttendanceDays,
  fetchAttendanceEntries,
  fetchAttendanceEvents,
  fetchWorkers,
  fetchWorkersAll,
  reopenAttendanceShift,
  updateWorkerViaRpc,
  upsertAttendanceEntry,
} from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { formatDateTime, todayLocalIso } from "@/lib/format";
import { fieldClass, labelClass } from "@/lib/ui";
import type {
  AttendanceDay,
  AttendanceEntry,
  AttendanceEvent,
  Company,
  Profile,
  Shift,
  Worker,
} from "@/types/database";

const Modal = dynamic(() =>
  import("@/components/Modal").then((mod) => mod.Modal)
);

const COMPANIES: Company[] = ["NKPL", "APTUS"];
const SHIFTS: Shift[] = ["day", "night"];
const EVENT_LABELS: Record<AttendanceEvent["action"], string> = {
  entry_created: "Absence added",
  entry_updated: "Absence changed",
  entry_deleted: "Absence removed",
  shift_confirmed: "Shift marked done",
  shift_reopened: "Shift opened again",
};

type Tab = "today" | "month" | "workers";

type Props = { profile: Profile };

function monthPrefixFromDate(iso: string): string {
  return iso.slice(0, 7);
}

export function AttendanceSummary({ profile }: Props) {
  const isAdmin = profile.role === "admin";
  const [tab, setTab] = useState<Tab>("today");
  const [workDate, setWorkDate] = useState(() => todayLocalIso());
  const [month, setMonth] = useState(() => monthPrefixFromDate(todayLocalIso()));
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const loadSequence = useRef(0);

  // Inline admin form state
  const [formTarget, setFormTarget] = useState<{
    company: Company;
    shift: Shift;
    entry?: AttendanceEntry | null;
  } | null>(null);

  // Workers tab state
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerCompanyFilter, setWorkerCompanyFilter] = useState<
    Company | "all"
  >("all");
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editJob, setEditJob] = useState("");
  const [newWorkerCompany, setNewWorkerCompany] = useState<Company>("NKPL");
  const [newWorkerName, setNewWorkerName] = useState("");
  const [newWorkerJob, setNewWorkerJob] = useState("");

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      if (tab === "workers") {
        if (!isAdmin) return;
        const w = await fetchWorkersAll();
        if (sequence !== loadSequence.current) return;
        setWorkers(w);
        setDays([]);
        setEntries([]);
        setEvents([]);
      } else if (tab === "today") {
        // Two round trips: days + (entries ∥ events). No unused worker fetch.
        const d = await fetchAttendanceDays({ workDate });
        const dayIds = d.map((x) => x.id);
        const [entryRows, eventRows] = await Promise.all([
          fetchAttendanceEntries(dayIds),
          fetchAttendanceEvents(dayIds),
        ]);
        if (sequence !== loadSequence.current) return;
        setDays(d);
        setEntries(entryRows);
        setEvents(eventRows);
      } else {
        const d = await fetchAttendanceDays({ monthPrefix: month });
        const entryRows = await fetchAttendanceEntries(d.map((x) => x.id));
        if (sequence !== loadSequence.current) return;
        setDays(d);
        setEntries(entryRows);
        setEvents([]);
      }
      if (sequence !== loadSequence.current) return;
      setError(null);
    } catch (err) {
      if (sequence === loadSequence.current) setError(userMessageFromError(err));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [tab, workDate, month, isAdmin]);

  useEffect(() => {
    const kick = window.setTimeout(() => void load(), 0);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  // Flip lock labels at 10:00 without a 30s poll.
  useEffect(() => {
    if (tab !== "today") return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
    if (!m) return;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const lockUtc = Date.UTC(y, mo - 1, d + 1, 4, 30, 0);
    const delay = lockUtc - Date.now();
    const ms = delay <= 0 ? 0 : delay + 50;
    const timer = window.setTimeout(() => setNow(new Date()), ms);
    return () => window.clearTimeout(timer);
  }, [tab, workDate]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, AttendanceEntry[]>();
    for (const e of entries) {
      const list = map.get(e.attendance_day_id) ?? [];
      list.push(e);
      map.set(e.attendance_day_id, list);
    }
    return map;
  }, [entries]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AttendanceEvent[]>();
    for (const event of events) {
      const list = map.get(event.attendance_day_id) ?? [];
      list.push(event);
      map.set(event.attendance_day_id, list);
    }
    return map;
  }, [events]);

  const monthRows = useMemo(() => {
    if (tab !== "month") return [];
    return summariseMonth({ days, entries });
  }, [tab, days, entries]);

  const activeWorkers = useMemo(() => {
    return workers
      .filter((w) => w.active)
      .filter(
        (w) =>
          workerCompanyFilter === "all" || w.company === workerCompanyFilter
      )
      .filter(
        (w) =>
          !workerSearch.trim() ||
          w.full_name.toLowerCase().includes(workerSearch.trim().toLowerCase())
      );
  }, [workers, workerCompanyFilter, workerSearch]);

  const inactiveWorkers = useMemo(() => {
    return workers
      .filter((w) => !w.active)
      .filter(
        (w) =>
          workerCompanyFilter === "all" || w.company === workerCompanyFilter
      )
      .filter(
        (w) =>
          !workerSearch.trim() ||
          w.full_name.toLowerCase().includes(workerSearch.trim().toLowerCase())
      );
  }, [workers, workerCompanyFilter, workerSearch]);

  async function refreshFormWorkers(company: Company) {
    const roster = await fetchWorkers(company);
    setWorkers((prev) => {
      const others = prev.filter((w) => w.company !== company || !w.active);
      const merged = new Map<string, Worker>();
      for (const w of [...others, ...roster]) merged.set(w.id, w);
      return [...merged.values()].sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      );
    });
    return roster;
  }

  async function openAdd(company: Company, shift: Shift) {
    setBusy(true);
    setError(null);
    try {
      await refreshFormWorkers(company);
      setFormTarget({ company, shift, entry: null });
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function openEdit(
    company: Company,
    shift: Shift,
    entry: AttendanceEntry
  ) {
    setBusy(true);
    setError(null);
    try {
      await refreshFormWorkers(company);
      setFormTarget({ company, shift, entry });
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveAbsence(value: {
    workerId: string;
    informed: boolean;
    reason: import("@/types/database").AbsenceReason;
    note: string | null;
  }) {
    if (!formTarget) return;
    setBusy(true);
    setError(null);
    try {
      await upsertAttendanceEntry({
        workDate,
        shift: formTarget.shift,
        workerId: value.workerId,
        informed: value.informed,
        reason: value.reason,
        note: value.note,
        company: formTarget.company,
      });
      setFormTarget(null);
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(entryId: string) {
    setBusy(true);
    setError(null);
    try {
      await deleteAttendanceEntry(entryId);
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onMarkDone(company: Company, shift: Shift) {
    setBusy(true);
    setError(null);
    try {
      await confirmAttendanceShift({ workDate, shift, company });
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onOpenAgain(company: Company, shift: Shift) {
    setBusy(true);
    setError(null);
    try {
      await reopenAttendanceShift({ workDate, shift, company });
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveWorkerEdit() {
    if (!editWorker) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWorkerViaRpc({
        workerId: editWorker.id,
        fullName: editName.trim(),
        designation: editJob.trim() || null,
      });
      setWorkers((prev) =>
        prev
          .map((w) => (w.id === updated.id ? updated : w))
          .sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
      setEditWorker(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(worker: Worker) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateWorkerViaRpc({
        workerId: worker.id,
        active: !worker.active,
      });
      setWorkers((prev) =>
        prev.map((w) => (w.id === updated.id ? updated : w))
      );
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddWorker() {
    const name = newWorkerName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const w = await addWorker({
        fullName: name,
        designation: newWorkerJob.trim() || null,
        company: newWorkerCompany,
      });
      setWorkers((prev) =>
        [...prev, w].sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
      setAddWorkerOpen(false);
      setNewWorkerName("");
      setNewWorkerJob("");
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs = useMemo(() => {
    const base: Array<[Tab, string]> = [
      ["today", "Today"],
      ["month", "Month"],
    ];
    if (isAdmin) base.push(["workers", "Workers"]);
    return base;
  }, [isAdmin]);

  if (loading) return <PageLoading />;

  const formDay = formTarget
    ? (days.find(
        (d) =>
          d.company === formTarget.company && d.shift === formTarget.shift
      ) ?? null)
    : null;
  const formEntries = formDay
    ? (entriesByDay.get(formDay.id) ?? [])
    : [];
  const formRecorded = new Set(
    formEntries
      .filter((e) => e.id !== formTarget?.entry?.id)
      .map((e) => e.worker_id)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Attendance</h1>
          <p className="text-sm font-medium text-slate-500">
            Who did not come, and why
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setLoading(true);
                setTab(id);
              }}
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

      {tab !== "workers" ? (
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
      ) : null}

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
                const actions = getAttendanceDayActions(
                  profile.role,
                  profile,
                  { company, workDate },
                  day,
                  now
                );
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
                    {actions.isLocked ? (
                      <p className="mb-2 text-xs font-medium text-amber-800">
                        This day is closed. Only the admin can change it now.
                      </p>
                    ) : null}
                    {actions.isDone && !actions.isLocked ? (
                      <p className="mb-2 text-xs font-medium text-emerald-800">
                        Marked done
                      </p>
                    ) : null}
                    {summary.state === "not_submitted" ? (
                      <p className="text-sm font-medium text-amber-900">
                        Not sent — the supervisor has not finished this shift
                        yet
                      </p>
                    ) : null}
                    {summary.state === "confirmed_all_present" ? (
                      <p className="text-sm font-medium text-emerald-800">
                        Everyone came
                      </p>
                    ) : null}
                    {dayEntries.length > 0 ? (
                      <ul className="mt-2 space-y-2">
                        {dayEntries.map((e) => (
                          <li
                            key={e.id}
                            className="border-t border-slate-100 pt-2 text-sm first:border-0 first:pt-0"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
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
                                  {REASON_LABELS[e.reason]}
                                  {e.informed
                                    ? " · Told us"
                                    : " · Did not tell"}
                                </div>
                                {e.note ? (
                                  <p className="mt-0.5 text-xs text-slate-600">
                                    {e.note}
                                  </p>
                                ) : null}
                              </div>
                              {actions.showEdit || actions.showRemove ? (
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  {actions.showEdit ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() =>
                                        void openEdit(company, shift, e)
                                      }
                                      className="text-xs font-bold text-blue-600"
                                    >
                                      Edit
                                    </button>
                                  ) : null}
                                  {actions.showRemove ? (
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={() => void onDelete(e.id)}
                                      className="text-xs font-bold text-rose-600"
                                    >
                                      Remove
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {actions.showAdd ||
                    actions.showMarkDone ||
                    actions.showOpenAgain ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                        {actions.showAdd ? (
                          <LoadingButton
                            type="button"
                            loading={busy}
                            onClick={() => void openAdd(company, shift)}
                            className="!min-h-9 !px-3 !text-xs"
                          >
                            + Add absent worker
                          </LoadingButton>
                        ) : null}
                        {actions.showMarkDone ? (
                          <LoadingButton
                            type="button"
                            variant="secondary"
                            loading={busy}
                            onClick={() => void onMarkDone(company, shift)}
                            className="!min-h-9 !px-3 !text-xs"
                          >
                            Mark shift done
                          </LoadingButton>
                        ) : null}
                        {actions.showOpenAgain ? (
                          <LoadingButton
                            type="button"
                            variant="secondary"
                            loading={busy}
                            onClick={() => void onOpenAgain(company, shift)}
                            className="!min-h-9 !px-3 !text-xs"
                          >
                            Open again to edit
                          </LoadingButton>
                        ) : null}
                      </div>
                    ) : null}
                    {dayEvents.length > 0 ? (
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          Changes
                        </p>
                        {dayEvents.map((event) => (
                          <p
                            key={event.id}
                            className="mt-1 text-xs font-medium text-slate-600"
                          >
                            {EVENT_LABELS[event.action]} by{" "}
                            {event.actor_name ?? "Admin"} ·{" "}
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
      ) : null}

      {tab === "month" ? (
        monthRows.length === 0 ? (
          <EmptyState text="Nobody was absent this month." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2">Co.</th>
                  <th className="px-3 py-2">Absent</th>
                  <th className="px-3 py-2">Told us</th>
                  <th className="px-3 py-2">No word</th>
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
                    <td className="px-3 py-2 text-slate-700">
                      {r.informedCount}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {r.uninformedCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "workers" && isAdmin ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[12rem] flex-1">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                Search
              </span>
              <input
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                placeholder="Search workers…"
                className={`${fieldClass} py-2 text-sm`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">
                Company
              </span>
              <select
                value={workerCompanyFilter}
                onChange={(e) =>
                  setWorkerCompanyFilter(e.target.value as Company | "all")
                }
                className={`${fieldClass} py-2 text-sm`}
              >
                <option value="all">Both</option>
                <option value="NKPL">NKPL</option>
                <option value="APTUS">APTUS</option>
              </select>
            </label>
            <LoadingButton
              type="button"
              loading={busy}
              onClick={() => setAddWorkerOpen(true)}
            >
              + Add new worker
            </LoadingButton>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700">Active</h2>
            {activeWorkers.length === 0 ? (
              <EmptyState text="No active workers match." />
            ) : (
              <ul className="space-y-2">
                {activeWorkers.map((w) => (
                  <WorkerRow
                    key={w.id}
                    worker={w}
                    busy={busy}
                    onEdit={() => {
                      setEditWorker(w);
                      setEditName(w.full_name);
                      setEditJob(w.designation ?? "");
                    }}
                    onToggle={() => void onToggleActive(w)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-slate-700">Deactivated</h2>
            {inactiveWorkers.length === 0 ? (
              <p className="text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-2">
                {inactiveWorkers.map((w) => (
                  <WorkerRow
                    key={w.id}
                    worker={w}
                    busy={busy}
                    onEdit={() => {
                      setEditWorker(w);
                      setEditName(w.full_name);
                      setEditJob(w.designation ?? "");
                    }}
                    onToggle={() => void onToggleActive(w)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <Modal
        open={formTarget != null}
        titleId="admin-absence-form"
        title={formTarget?.entry ? "Edit absence" : "Add absent worker"}
        onClose={() => !busy && setFormTarget(null)}
      >
        {formTarget ? (
          <AbsenceEntryForm
            key={formTarget.entry?.id ?? `${formTarget.company}-${formTarget.shift}`}
            company={formTarget.company}
            workers={workers.filter((w) => w.company === formTarget.company)}
            recordedWorkerIds={formRecorded}
            initial={formTarget.entry}
            busy={busy}
            allowAddWorker
            onWorkersChange={setWorkers}
            onSubmit={onSaveAbsence}
            onCancel={() => setFormTarget(null)}
          />
        ) : null}
      </Modal>

      <Modal
        open={editWorker != null}
        titleId="edit-worker"
        title="Edit worker"
        onClose={() => !busy && setEditWorker(null)}
      >
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="edit-worker-name">
              Full name
            </label>
            <input
              id="edit-worker-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="edit-worker-job">
              Job
            </label>
            <input
              id="edit-worker-job"
              value={editJob}
              onChange={(e) => setEditJob(e.target.value)}
              className={fieldClass}
            />
          </div>
          <LoadingButton
            type="button"
            loading={busy}
            disabled={!editName.trim()}
            onClick={() => void onSaveWorkerEdit()}
            className="w-full"
          >
            Save
          </LoadingButton>
        </div>
      </Modal>

      <Modal
        open={addWorkerOpen}
        titleId="add-worker-admin"
        title="Add new worker"
        onClose={() => !busy && setAddWorkerOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="new-worker-company">
              Company
            </label>
            <select
              id="new-worker-company"
              value={newWorkerCompany}
              onChange={(e) => setNewWorkerCompany(e.target.value as Company)}
              className={fieldClass}
            >
              <option value="NKPL">NKPL</option>
              <option value="APTUS">APTUS</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="new-worker-name">
              Full name
            </label>
            <input
              id="new-worker-name"
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-worker-job">
              Job (optional)
            </label>
            <input
              id="new-worker-job"
              value={newWorkerJob}
              onChange={(e) => setNewWorkerJob(e.target.value)}
              className={fieldClass}
            />
          </div>
          <LoadingButton
            type="button"
            loading={busy}
            disabled={!newWorkerName.trim()}
            onClick={() => void onAddWorker()}
            className="w-full"
          >
            Add
          </LoadingButton>
        </div>
      </Modal>
    </div>
  );
}

function WorkerRow({
  worker,
  busy,
  onEdit,
  onToggle,
}: {
  worker: Worker;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3">
      <div className="min-w-0">
        <p className="font-bold text-slate-900">{worker.full_name}</p>
        <p className="text-xs font-medium text-slate-500">
          {worker.company}
          {worker.designation ? ` · ${worker.designation}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          className="text-xs font-bold text-blue-600"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          className="text-xs font-bold text-slate-600"
        >
          {worker.active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
    </li>
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
        Not sent
      </span>
    );
  }
  if (state === "confirmed_all_present") {
    return (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
        Everyone came
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
      Done
    </span>
  );
}
