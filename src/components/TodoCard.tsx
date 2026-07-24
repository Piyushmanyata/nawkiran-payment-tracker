"use client";

import { memo } from "react";
import type { Todo, UserRole } from "@/types/database";
import {
  formatTodoDueLabel,
  formatWhen,
  isTodoOverdue,
} from "@/lib/format";
import { canDeleteTodo, canEditTodo } from "@/lib/roles";
import { LoadingButton } from "@/components/LoadingButton";
import { TodoThreadPanel } from "@/components/TodoThreadPanel";

import { formatRecurrenceLabel } from "@/lib/recurrence";

function TodoCardInner({
  todo,
  role,
  userId,
  onComplete,
  onEdit,
  onDelete,
  onRequestUpdate,
  onReplyUpdate,
  busy,
}: {
  todo: Todo;
  role: UserRole | null;
  userId: string | null;
  onComplete?: (t: Todo) => void;
  onEdit?: (t: Todo) => void;
  onDelete?: (t: Todo) => void;
  onRequestUpdate?: (t: Todo, message: string) => Promise<void>;
  onReplyUpdate?: (t: Todo, parentId: string, message: string) => Promise<void>;
  busy?: boolean;
}) {
  const open = todo.status === "open";
  const overdue = isTodoOverdue(todo.status, todo.due_date);
  const showEdit = open && canEditTodo(role, todo, userId) && Boolean(onEdit);
  const showComplete = open && Boolean(onComplete);
  const showDelete = canDeleteTodo(role) && Boolean(onDelete);
  const assigneeNames = todo.assignees.map((a) => a.full_name).filter(Boolean);
  const recLabel = formatRecurrenceLabel(todo.recurrence_rule);

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm transition hover:border-slate-300 ${
        open && overdue ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3 className="text-base font-bold leading-snug text-slate-900">
              {todo.title}
            </h3>
            {todo.priority === "urgent" ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700">
                Urgent
              </span>
            ) : null}
            {recLabel ? (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                🔁 {recLabel}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            open ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {open ? "Open" : "Done"}
        </span>
      </div>

      <p
        className={`mt-3 text-sm ${
          overdue ? "font-semibold text-amber-800" : "text-slate-600"
        }`}
      >
        {formatTodoDueLabel(todo.status, todo.due_date)}
      </p>

      <dl className="mt-2 grid gap-0.5 text-xs text-slate-500">
        {assigneeNames.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            <dt>For</dt>
            <dd className="font-semibold text-slate-600">
              {assigneeNames.join(", ")}
            </dd>
          </div>
        ) : null}
        {todo.creator_name ? (
          <div className="flex flex-wrap gap-1">
            <dt>By</dt>
            <dd className="font-semibold text-slate-600">
              {todo.creator_name}
              {todo.created_at ? ` · ${formatWhen(todo.created_at)}` : ""}
            </dd>
          </div>
        ) : null}
        {!open && todo.completer_name ? (
          <div className="flex flex-wrap gap-1">
            <dt>Done by</dt>
            <dd className="font-semibold text-slate-600">
              {todo.completer_name}
              {todo.completed_at ? ` · ${formatWhen(todo.completed_at)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      <TodoThreadPanel
        todo={todo}
        onRequestUpdate={onRequestUpdate}
        onReplyUpdate={onReplyUpdate}
      />

      {/* Main Action Buttons (Mark done, Edit, Delete) */}
      {showComplete || showEdit || showDelete ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {showComplete ? (
            <LoadingButton
              variant="primary"
              loading={busy}
              loadingText="Saving..."
              onClick={() => onComplete?.(todo)}
            >
              Mark done
            </LoadingButton>
          ) : null}
          {showEdit ? (
            <LoadingButton
              variant="secondary"
              disabled={busy}
              onClick={() => onEdit?.(todo)}
            >
              Edit
            </LoadingButton>
          ) : null}
          {showDelete ? (
            <LoadingButton
              variant="danger"
              disabled={busy}
              className={showComplete || showEdit ? "sm:col-span-2" : ""}
              onClick={() => onDelete?.(todo)}
            >
              Delete
            </LoadingButton>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const TodoCard = memo(TodoCardInner);
