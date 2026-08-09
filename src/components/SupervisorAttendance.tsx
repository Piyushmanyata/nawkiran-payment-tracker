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
  isAttendanceLocked,
} from "@/lib/attendance";
import {
  REASON_LABELS,
  confirmAttendanceShift,
  deleteAttendanceEntry,
  fetchAttendanceDays,
  fetchAttendanceEntries,
  fetchWorkers,
  upsertAttendanceEntry,
} from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { todayLocalIso } from "@/lib/format";
import { fieldClass } from "@/lib/ui";
import type {
  AttendanceDay,
  AttendanceEntry,
  Company,
  Profile,
  Shift,
  Worker,
} from "@/types/database";

const Modal = dynamic(() =>
  import("@/components/Modal").then((mod) => mod.Modal)
);

type Props = { profile: Profile };

/** Next lock instant (10:00 IST on D+1) as a Date, or null if already locked. */
function msUntilLock(workDate: string, now: Date): number | null {
  if (isAttendanceLocked(workDate, now)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(workDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Lock at 10:00 IST on D+1 = 04:30 UTC on D+1.
  const lockUtc = Date.UTC(y, mo - 1, d + 1, 4, 30, 0);
  const ms = lockUtc - now.getTime();
  return ms > 0 ? ms : 0;
}

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
  const workersLoadedFor = useRef<Company | null>(null);

  const [markOpen, setMarkOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<AttendanceEntry | null>(null);

  const actions = useMemo(() => {
    if (!company) {
      return getAttendanceDayActions(null, null, {
        company: "NKPL",
        workDate,
      }, null, 0, now);
    }
    return getAttendanceDayActions(
      "supervisor",
      profile,
      { company, workDate },
      day,
      entries.length,
      now
    );
  }, [company, profile, workDate, day, entries.length, now]);

  const recordedIds = useMemo(
    () => new Set(entries.map((e) => e.worker_id)),
    [entries]
  );

  const loadDay = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      if (!company) {
        throw new Error(
          "Your account has no company. Ask an admin to set it."
        );
      }
      // Workers depend only on company — do not re-fetch on date/shift flip.
      if (workersLoadedFor.current !== company) {
        const roster = await fetchWorkers(company);
        if (sequence !== loadSequence.current) return;
        setWorkers(roster);
        workersLoadedFor.current = company;
      }

      const days = await fetchAttendanceDays({ workDate, company });
      if (sequence !== loadSequence.current) return;
      const match = days.find((d) => d.shift === shift) ?? null;
      const nextEntries = match
        ? await fetchAttendanceEntries([match.id])
        : [];
      if (sequence !== loadSequence.current) return;
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
    const kick = window.setTimeout(() => void loadDay(), 0);
    const onFocus = () => void loadDay();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearTimeout(kick);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadDay]);

  // Fire once at the lock instant instead of a 30s re-render timer.
  useEffect(() => {
    const delay = msUntilLock(workDate, new Date());
    const ms = delay == null ? 0 : delay + 50;
    const timer = window.setTimeout(() => setNow(new Date()), ms);
    return () => window.clearTimeout(timer);
  }, [workDate]);

  /** Answers "everyone came" on a Shift with no absences (ADR-0012). */
  async function onEveryoneCame() {
    if (!company || !actions.showEveryoneCame) return;
    setBusy(true);
    setError(null);
    try {
      const d = await confirmAttendanceShift({ workDate, shift, company });
      setDay(d);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(entryId: string) {
    if (!actions.showRemove) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAttendanceEntry(entryId);
      await loadDay();
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
    if (!company) return;
    setBusy(true);
    setError(null);
    try {
      await upsertAttendanceEntry({
        workDate,
        shift,
        workerId: value.workerId,
        informed: value.informed,
        reason: value.reason,
        note: value.note,
        company,
      });
      setMarkOpen(false);
      setEditEntry(null);
      await loadDay();
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusy(false);
    }
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
            {company} · who did not come
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

      {error ? <ErrorBanner message={error} onRetry={() => void loadDay()} /> : null}

      {actions.isLocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          This day is closed. Only the admin can change it now.
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

      {actions.isDone ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          {entries.length === 0
            ? "Everyone came"
            : `${entries.length} absent`}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600">
          Not sent yet
        </div>
      )}

      {actions.showEveryoneCame ? (
        // The one case with no evidence to infer from, so the screen refuses to
        // look finished until it is answered (ADR-0012).
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
          <p className="text-sm font-bold text-amber-900">
            Did anyone miss the {shift} shift?
          </p>
          <p className="mt-1 text-xs font-medium text-amber-800">
            Until you answer, this shift stays unsent.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <LoadingButton
              type="button"
              loading={busy}
              onClick={() => {
                setEditEntry(null);
                setMarkOpen(true);
              }}
            >
              + Add absent worker
            </LoadingButton>
            <LoadingButton
              type="button"
              variant="secondary"
              loading={busy}
              onClick={() => void onEveryoneCame()}
            >
              No, everyone came
            </LoadingButton>
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700">Absent today</h2>
        {entries.length === 0 ? (
          <EmptyState
            text={actions.isDone ? "Everyone came" : "Nobody absent yet"}
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
                    {REASON_LABELS[e.reason]}
                    {e.informed ? " · Told us" : " · Did not tell"}
                  </p>
                  {e.note ? (
                    <p className="mt-0.5 text-xs text-slate-600">{e.note}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {actions.showEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditEntry(e)}
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {actions.showAdd && !actions.showEveryoneCame ? (
        <div className="flex flex-col gap-2 pt-1">
          <LoadingButton
            type="button"
            loading={busy}
            onClick={() => {
              setEditEntry(null);
              setMarkOpen(true);
            }}
          >
            + Add absent worker
          </LoadingButton>
        </div>
      ) : null}

      <Modal
        open={markOpen || editEntry != null}
        titleId="add-absent-worker"
        title={editEntry ? "Edit absence" : "Add absent worker"}
        onClose={() => {
          if (busy) return;
          setMarkOpen(false);
          setEditEntry(null);
        }}
      >
        <AbsenceEntryForm
          key={editEntry?.id ?? "new"}
          company={company}
          workers={workers}
          recordedWorkerIds={
            editEntry
              ? new Set(
                  [...recordedIds].filter((id) => id !== editEntry.worker_id)
                )
              : recordedIds
          }
          initial={editEntry}
          busy={busy}
          allowAddWorker
          onWorkersChange={setWorkers}
          onSubmit={onSaveAbsence}
          onCancel={() => {
            setMarkOpen(false);
            setEditEntry(null);
          }}
        />
      </Modal>
    </div>
  );
}
