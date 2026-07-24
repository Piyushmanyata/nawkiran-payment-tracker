"use client";

import { useState, type FormEvent } from "react";
import type { CreateTodoInput, Profile, RecurrenceRule, RecurrenceType, Todo, TodoPriority } from "@/types/database";
import { calculateInitialDueDate } from "@/lib/recurrence";
import { LoadingButton } from "@/components/LoadingButton";
import {
  errorBoxClass,
  fieldClass,
  hintClass,
  labelClass,
} from "@/lib/ui";

const DAYS = [
  { id: 1, label: "M" },
  { id: 2, label: "T" },
  { id: 3, label: "W" },
  { id: 4, label: "T" },
  { id: 5, label: "F" },
  { id: 6, label: "S" },
  { id: 7, label: "S" },
];

export function TodoForm({
  profiles,
  initial,
  loading,
  error,
  onCancel,
  onSubmit,
}: {
  profiles: Profile[];
  initial?: Todo | null;
  loading: boolean;
  error: string | null;
  onCancel?: () => void;
  onSubmit: (input: CreateTodoInput) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [priority, setPriority] = useState<TodoPriority>(
    initial?.priority ?? "normal"
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assignees.map((a) => a.id) ?? []
  );
  const [recType, setRecType] = useState<RecurrenceType>(
    initial?.recurrence_rule?.type ?? "none"
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    initial?.recurrence_rule?.days_of_week ?? [1]
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(
    initial?.recurrence_rule?.day_of_month ?? 1
  );

  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setTitle(initial?.title ?? "");
    setDueDate(initial?.due_date ?? "");
    setPriority(initial?.priority ?? "normal");
    setAssigneeIds(initial?.assignees.map((a) => a.id) ?? []);
    setRecType(initial?.recurrence_rule?.type ?? "none");
    setDaysOfWeek(initial?.recurrence_rule?.days_of_week ?? [1]);
    setDayOfMonth(initial?.recurrence_rule?.day_of_month ?? 1);
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleDayOfWeek(dayId: number) {
    setDaysOfWeek((prev) =>
      prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort((a, b) => a - b)
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const clean = title.trim();
    if (!clean) return;

    let recurrenceRule: RecurrenceRule | null = null;
    let finalDueDate = dueDate || null;

    if (recType !== "none") {
      if (recType === "custom_weekly") {
        recurrenceRule = {
          type: recType,
          days_of_week: daysOfWeek.length > 0 ? daysOfWeek : [1],
        };
      } else if (recType === "custom_monthly") {
        recurrenceRule = { type: recType, day_of_month: dayOfMonth };
      } else {
        recurrenceRule = { type: recType };
      }
      if (!finalDueDate) {
        finalDueDate = calculateInitialDueDate(recurrenceRule);
      }
    }

    onSubmit({
      title: clean,
      dueDate: finalDueDate,
      priority,
      assigneeIds,
      recurrenceRule,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className={labelClass}>To-do *</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          placeholder="What needs doing?"
          className={fieldClass}
        />
        <span className={hintClass}>Up to 200 characters</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TodoPriority)}
            className={fieldClass}
          >
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Repeat</span>
          <select
            value={recType}
            onChange={(e) => setRecType(e.target.value as RecurrenceType)}
            className={fieldClass}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
            <option value="monthly">Every month</option>
            <option value="yearly">Every year</option>
            <option value="custom_weekly">Specific days of week</option>
            <option value="custom_monthly">Specific day of month</option>
          </select>
        </label>

        {recType === "custom_weekly" ? (
          <div>
            <span className={labelClass}>Days of week</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = daysOfWeek.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDayOfWeek(d.id)}
                    className={`h-9 w-9 rounded-full text-xs font-bold transition ${
                      on
                        ? "bg-purple-600 text-white"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : recType === "custom_monthly" ? (
          <label className="block">
            <span className={labelClass}>Day of month (1-31)</span>
            <select
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value))}
              className={fieldClass}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <fieldset>
        <legend className={labelClass}>Assignees (optional)</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {profiles.map((p) => {
            const on = assigneeIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleAssignee(p.id)}
                className={`min-h-10 rounded-full px-3 text-sm font-semibold transition ${
                  on
                    ? "bg-blue-600 text-white"
                    : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {p.full_name}
              </button>
            );
          })}
        </div>
        <span className={hintClass}>
          Anyone can complete. Assignees only help filter and get a push.
        </span>
      </fieldset>

      {error ? <p className={errorBoxClass}>{error}</p> : null}

      <div className={`grid gap-3 ${onCancel ? "grid-cols-2" : ""}`}>
        {onCancel ? (
          <LoadingButton
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={onCancel}
          >
            Cancel
          </LoadingButton>
        ) : null}
        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Saving..."
        >
          {initial ? "Save changes" : "Add to-do"}
        </LoadingButton>
      </div>
    </form>
  );
}
