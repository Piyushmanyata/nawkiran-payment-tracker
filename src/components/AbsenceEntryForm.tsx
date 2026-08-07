"use client";

import { useMemo, useState } from "react";
import { LoadingButton } from "@/components/LoadingButton";
import {
  ABSENCE_REASONS,
  reasonForInformedAnswer,
  validateEntry,
} from "@/lib/attendance";
import { REASON_LABELS, addWorker } from "@/lib/attendance-data";
import { userMessageFromError } from "@/lib/errors";
import { fieldClass, labelClass } from "@/lib/ui";
import type {
  AbsenceReason,
  AttendanceEntry,
  Company,
  Worker,
} from "@/types/database";

export type AbsenceEntryFormValue = {
  workerId: string;
  informed: boolean;
  reason: AbsenceReason;
  note: string | null;
};

type Props = {
  /** Company being recorded for — Admin may pass either company. */
  company: Company;
  workers: Worker[];
  recordedWorkerIds: ReadonlySet<string>;
  /** When editing an existing absence. */
  initial?: AttendanceEntry | null;
  busy: boolean;
  /** Supervisors can add workers; Admin Workers tab owns full CRUD. */
  allowAddWorker?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onWorkersChange?: (workers: Worker[]) => void;
  onSubmit: (value: AbsenceEntryFormValue) => void | Promise<void>;
  onCancel?: () => void;
};

export function AbsenceEntryForm({
  company,
  workers,
  recordedWorkerIds,
  initial = null,
  busy,
  allowAddWorker = false,
  onBusyChange,
  onWorkersChange,
  onSubmit,
  onCancel,
}: Props) {
  const editing = Boolean(initial);
  const [search, setSearch] = useState("");
  const [workerId, setWorkerId] = useState<string | null>(
    initial?.worker_id ?? null
  );
  const [informed, setInformed] = useState<boolean | null>(
    initial ? initial.informed : null
  );
  const [reason, setReason] = useState<AbsenceReason | null>(
    initial?.reason ?? null
  );
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [addWorkerOpen, setAddWorkerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newJob, setNewJob] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  const isBusy = busy || localBusy;

  const filteredWorkers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter(
      (w) =>
        w.company === company &&
        w.active &&
        (!q || w.full_name.toLowerCase().includes(q))
    );
  }, [workers, company, search]);

  function answerInformed(value: boolean) {
    setInformed(value);
    setReason((current) => reasonForInformedAnswer(value, current));
  }

  async function handleSubmit() {
    if (!workerId) return;
    // The note box only exists for 'other' — never carry it onto another reason.
    const noteValue = reason === "other" ? note.trim() || null : null;
    const validation = validateEntry({ informed, reason, note: noteValue });
    if (!validation.ok) {
      setError(userMessageFromError(new Error(validation.error)));
      return;
    }
    if (informed == null || reason == null) return;
    setError(null);
    await onSubmit({ workerId, informed, reason, note: noteValue });
  }

  async function handleAddWorker() {
    const name = newName.trim();
    if (!name) return;
    setLocalBusy(true);
    onBusyChange?.(true);
    setError(null);
    try {
      const w = await addWorker({
        fullName: name,
        designation: newJob.trim() || null,
        company,
      });
      const next = [...workers, w].sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      );
      onWorkersChange?.(next);
      setWorkerId(w.id);
      setAddWorkerOpen(false);
      setNewName("");
      setNewJob("");
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setLocalBusy(false);
      onBusyChange?.(false);
    }
  }

  if (addWorkerOpen) {
    return (
      <div className="space-y-3">
        {error ? (
          <p className="text-sm font-medium text-rose-600">{error}</p>
        ) : null}
        <div>
          <label className={labelClass} htmlFor="absence-new-name">
            Full name
          </label>
          <input
            id="absence-new-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={fieldClass}
            autoFocus
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="absence-new-job">
            Job (optional)
          </label>
          <input
            id="absence-new-job"
            value={newJob}
            onChange={(e) => setNewJob(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex gap-2">
          <LoadingButton
            type="button"
            variant="secondary"
            loading={isBusy}
            onClick={() => setAddWorkerOpen(false)}
            className="flex-1"
          >
            Back
          </LoadingButton>
          <LoadingButton
            type="button"
            loading={isBusy}
            disabled={!newName.trim()}
            onClick={() => void handleAddWorker()}
            className="flex-1"
          >
            Add
          </LoadingButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : null}

      {!editing ? (
        <div>
          <label className={labelClass} htmlFor="absence-worker-search">
            Worker
          </label>
          <input
            id="absence-worker-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workers…"
            className={fieldClass}
          />
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {filteredWorkers.map((w) => {
              const taken = recordedWorkerIds.has(w.id);
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
                    {taken ? <span className="text-xs">Recorded</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {allowAddWorker ? (
            <button
              type="button"
              className="mt-2 text-xs font-bold text-blue-600"
              onClick={() => setAddWorkerOpen(true)}
            >
              + Add new worker
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-semibold text-slate-800">
          {initial?.worker_name ?? "Worker"}
        </p>
      )}

      <div>
        <p className={labelClass}>Did he tell us?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => answerInformed(true)}
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
            onClick={() => answerInformed(false)}
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
          <label className={labelClass} htmlFor="absence-note">
            Note
          </label>
          <input
            id="absence-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className={fieldClass}
            placeholder="Short explanation"
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        {onCancel ? (
          <LoadingButton
            type="button"
            variant="secondary"
            loading={isBusy}
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </LoadingButton>
        ) : null}
        <LoadingButton
          type="button"
          loading={isBusy}
          disabled={!workerId || informed == null || reason == null}
          onClick={() => void handleSubmit()}
          className="flex-1"
        >
          Save
        </LoadingButton>
      </div>
    </div>
  );
}
