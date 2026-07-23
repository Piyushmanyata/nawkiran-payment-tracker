"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Profile, Todo, TodoPriority } from "@/types/database";
import { LoadingButton } from "@/components/LoadingButton";
import {
  errorBoxClass,
  fieldClass,
  hintClass,
  labelClass,
} from "@/lib/ui";

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
  onSubmit: (input: {
    title: string;
    dueDate: string | null;
    priority: TodoPriority;
    assigneeIds: string[];
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [priority, setPriority] = useState<TodoPriority>(
    initial?.priority ?? "normal"
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initial?.assignees.map((a) => a.id) ?? []
  );

  useEffect(() => {
    setTitle(initial?.title ?? "");
    setDueDate(initial?.due_date ?? "");
    setPriority(initial?.priority ?? "normal");
    setAssigneeIds(initial?.assignees.map((a) => a.id) ?? []);
  }, [initial]);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const clean = title.trim();
    if (!clean) return;
    onSubmit({
      title: clean,
      dueDate: dueDate || null,
      priority,
      assigneeIds,
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
