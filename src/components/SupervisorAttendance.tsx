"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingButton } from "@/components/LoadingButton";
import { PageLoading } from "@/components/PageLoading";
import {
  ABSENCE_REASONS,
  canWriteAttendance,
  isAttendanceLocked,
  validateEntry,
} from "@/lib/attendance";
import {
  KIND_LABELS,
  REASON_LABELS,
  addWorker,
  confirmAttendanceShift,
  deleteAttendanceEntry,
  fetchAttendanceDays,
  fetchAttendanceEntries,
  fetchWorkers,
  reopenAttendanceShift,
  upsertAttendanceEntry,
} from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { todayLocalIso } from "@/lib/format";
import { fieldClass, labelClass } from "@/lib/ui";
import type {
  AbsenceReason,
  AttendanceDay,
  AttendanceEntry,
  AttendanceKind,
  Company,
  Profile,
  Shift,
  Worker,
} from "@/types/database";

const Modal = dynamic(() =>
  import("@/components/Modal").then((mod) => mod.Modal)
);

type Props = { profile: Profile };

export function SupervisorAttendance({ profile }: Props) {
  const company = profile.company as Company | null;
  const [workDate, setWorkDate] = useState(() => todayLocalIso());
  const [shift, setShift] = useState<Shift>("day");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [day, setDay] = useState<AttendanceDay | null>(null);
  const [entries, setEntries] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const loadSequence = useRef(0);

  const [markOpen, setMarkOpen] = useState(false);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<AttendanceKind>("absent");
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [informed, setInformed] = useState<boolean | null>(null);
  const [reason, setReason] = useState<AbsenceReason | null>(null);
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesig, setNewDesig] = useState("");

  const writable =
    company != null &&
    canWriteAttendance(
      "supervisor",
      { company, workDate },
      profile
    );
  const locked = isAttendanceLocked(workDate, now);
  const confirmed = Boolean(day?.confirmed_at || day?.confirmed_by);
  const recordedIds = useMemo(
    () => new Set(entries.map((e) => e.worker_id)),
    [entries]
  );

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      if (!company) {
        throw new Error(
          "Your account has no company. Ask an admin to set it."
        );
      }
      const [roster, days] = await Promise.all([
        fetchWorkers(company),
        fetchAttendanceDays({ workDate, company }),
      ]);
      const match = days.find((d) => d.shift === shift) ?? null;
      const nextEntries = match
        ? await fetchAttendanceEntries([match.id])
        : [];
      if (sequence !== loadSequence.current) return;
      setWorkers(roster);
      setDay(match);
      setEntries(nextEntries);
      setError(null);
    } catch (err) {
      if (sequence === loadSequence.current) setError(userMessageFromError(err));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [company, workDate, shift]);

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

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter(
      (w) => !q || w.full_name.toLowerCase().includes(q)
    );
  }, [workers, search]);

  async function onConfirm() {
    if (!company || !writable) return;
    setBusy(true);
    setError(null);
    try {
      const d = await confirmAttendanceShift({
        workDate,
        shift,
        company,
      });
      setDay(d);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    if (!company || !writable) return;
    setBusy(true);
    setError(null);
    try {
      const d = await reopenAttendanceShift({ workDate, shift, company });
      setDay(d);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(entryId: string) {
    if (!writable || confirmed) return;
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

  async function onSaveEntry() {
    if (!company || !workerId || !writable || confirmed) return;
    const otherCompany: Company = company === "NKPL" ? "APTUS" : "NKPL";
    const validation = validateEntry({
      kind,
      company,
      informed: kind === "absent" ? informed : null,
      reason: kind === "absent" ? reason : null,
      note: kind === "absent" && reason === "other" ? note : null,
      lent_to_company: kind === "lent_out" ? otherCompany : null,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await upsertAttendanceEntry({
        workDate,
        shift,
        workerId,
        kind,
        informed: kind === "absent" ? informed : null,
        reason: kind === "absent" ? reason : null,
        note:
          kind === "absent" && reason === "other" ? note.trim() || null : null,
        lentToCompany: kind === "lent_out" ? otherCompany : null,
        company,
      });
      setMarkOpen(false);
      resetMarkForm();
      await load();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddWorker() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const w = await addWorker({
        fullName: name,
        designation: newDesig.trim() || null,
      });
      setWorkers((prev) =>
        [...prev, w].sort((a, b) => a.full_name.localeCompare(b.full_name))
      );
      setWorkerId(w.id);
      setAddWorkerOpen(false);
      setNewName("");
      setNewDesig("");
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  function resetMarkForm() {
    setSearch("");
    setKind("absent");
    setWorkerId(null);
    setInformed(null);
    setReason(null);
    setNote("");
  }

  if (!company) {
    return (
      <ErrorBanner message="Supervisor account has no company. Contact an admin." />
    );
  }

  if (loading) return <PageLoading />;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Attendance</h1>
          <p className="text-sm font-medium text-slate-500">
            {company} · exception log
          </p>
        </div>
        <label className="block">
          <span className="sr-only">Date</span>
          <input
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className={`${fieldClass} py-2 text-sm`}
          />
        </label>
      </div>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {locked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          This day is locked (after 10:00 IST next day). Only an admin can edit.
        </div>
      ) : null}

      <div className="flex rounded-xl bg-slate-100 p-1">
        {(["day", "night"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShift(s)}
            className={`min-h-11 flex-1 rounded-lg text-sm font-bold capitalize transition ${
              shift === s
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-600"
            }`}
          >
            {s} shift
          </button>
        ))}
      </div>

      {confirmed ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          Shift confirmed
          {entries.length === 0 ? " — everyone present" : ` — ${entries.length} exception(s)`}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          Not submitted yet
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">Exceptions</h2>
        {entries.length === 0 ? (
          <EmptyState
            text={
              confirmed
                ? "Confirmed with no exceptions — everyone came."
                : "No exceptions yet. Mark absences or lent-out workers."
            }
          />
        ) : (
          <ul className="space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">
                    {e.worker_name ?? "Worker"}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
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
                  </p>
                  {e.note ? (
                    <p className="mt-0.5 text-xs text-slate-600">{e.note}</p>
                  ) : null}
                </div>
                {writable && !confirmed ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onDelete(e.id)}
                    className="shrink-0 text-xs font-bold text-rose-600"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 pt-1">
        {writable && !confirmed ? (
          <LoadingButton
            type="button"
            loading={busy}
            onClick={() => {
              resetMarkForm();
              setMarkOpen(true);
            }}
          >
            + Mark exception
          </LoadingButton>
        ) : null}
        {writable && !confirmed ? (
          <LoadingButton
            type="button"
            variant="secondary"
            loading={busy}
            onClick={() => void onConfirm()}
          >
            Confirm shift
          </LoadingButton>
        ) : null}
        {writable && confirmed ? (
          <LoadingButton
            type="button"
            variant="secondary"
            loading={busy}
            onClick={() => void onReopen()}
          >
            Reopen shift
          </LoadingButton>
        ) : null}
      </div>

      <Modal
        open={markOpen}
        titleId="mark-exception"
        title="Mark exception"
        onClose={() => !busy && setMarkOpen(false)}
      >
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(Object.keys(KIND_LABELS) as AttendanceKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`min-h-10 flex-1 rounded-lg text-xs font-bold transition ${
                  kind === k ? "bg-white text-blue-600 shadow-xs" : "text-slate-600"
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>

          <div>
            <label className={labelClass} htmlFor="worker-search">
              Worker
            </label>
            <input
              id="worker-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search roster…"
              className={fieldClass}
            />
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {filteredWorkers.map((w) => {
                const taken = recordedIds.has(w.id);
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => setWorkerId(w.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                        workerId === w.id
                          ? "bg-blue-50 text-blue-700"
                          : taken
                            ? "text-slate-400"
                            : "text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      <span>{w.full_name}</span>
                      {taken ? (
                        <span className="text-xs">Recorded</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="mt-2 text-xs font-bold text-blue-600"
              onClick={() => setAddWorkerOpen(true)}
            >
              + Add worker to roster
            </button>
          </div>

          {kind === "absent" ? (
            <>
              <div>
                <p className={labelClass}>Informed?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInformed(true)}
                    className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
                      informed === true
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setInformed(false)}
                    className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${
                      informed === false
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-700"
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              <div>
                <p className={labelClass}>Reason</p>
                <div className="flex flex-wrap gap-2">
                  {ABSENCE_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                        reason === r
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-700"
                      }`}
                    >
                      {REASON_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
              {reason === "other" ? (
                <div>
                  <label className={labelClass} htmlFor="note">
                    Note
                  </label>
                  <input
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    className={fieldClass}
                    placeholder="Short explanation"
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {kind === "lent_out" ? (
            <p className="text-sm text-slate-600">
              Worker works at{" "}
              <strong>{company === "NKPL" ? "APTUS" : "NKPL"}</strong> today.
            </p>
          ) : null}

          <LoadingButton
            type="button"
            loading={busy}
            disabled={!workerId}
            onClick={() => void onSaveEntry()}
            className="w-full"
          >
            Save
          </LoadingButton>
        </div>
      </Modal>

      <Modal
        open={addWorkerOpen}
        titleId="add-worker"
        title="Add worker"
        onClose={() => !busy && setAddWorkerOpen(false)}
      >
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="new-name">
              Full name
            </label>
            <input
              id="new-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className={fieldClass}
              autoFocus
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-desig">
              Designation (optional)
            </label>
            <input
              id="new-desig"
              value={newDesig}
              onChange={(e) => setNewDesig(e.target.value)}
              className={fieldClass}
            />
          </div>
          <LoadingButton
            type="button"
            loading={busy}
            disabled={!newName.trim()}
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
