"use client";

import { memo, useState } from "react";
import type { Todo, UserRole } from "@/types/database";
import {
  formatTodoDueLabel,
  formatWhen,
  isTodoOverdue,
} from "@/lib/format";
import { canDeleteTodo, canEditTodo } from "@/lib/roles";
import { LoadingButton } from "@/components/LoadingButton";

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

  const threads = todo.threads ?? [];
  const topRequests = threads.filter((t) => t.type === "request");
  const threadCount = threads.length;

  const [expanded, setExpanded] = useState(false);
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqMessage, setReqMessage] = useState("Could you please provide an update on this?");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqMessage.trim() || !onRequestUpdate) return;
    setThreadBusy(true);
    setThreadError(null);
    try {
      await onRequestUpdate(todo, reqMessage.trim());
      setShowReqForm(false);
      setExpanded(true);
      setReqMessage("Could you please provide an update on this?");
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Failed to send update request");
    } finally {
      setThreadBusy(false);
    }
  }

  async function handleSendReply(e: React.FormEvent, parentId: string) {
    e.preventDefault();
    if (!replyMessage.trim() || !onReplyUpdate) return;
    setThreadBusy(true);
    setThreadError(null);
    try {
      await onReplyUpdate(todo, parentId, replyMessage.trim());
      setReplyingToId(null);
      setReplyMessage("");
      setExpanded(true);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setThreadBusy(false);
    }
  }

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

      {/* Thread Controls & Toggle Bar */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        {threadCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
          >
            <span>💬 {threadCount} {threadCount === 1 ? "update" : "updates"}</span>
            <span>{expanded ? "▲" : "▼"}</span>
          </button>
        ) : (
          <span className="text-slate-400">No updates requested</span>
        )}

        {open && onRequestUpdate ? (
          <button
            type="button"
            onClick={() => setShowReqForm(!showReqForm)}
            className="font-semibold text-slate-700 hover:text-blue-600"
          >
            + Ask for update
          </button>
        ) : null}
      </div>

      {/* Inline Request Form */}
      {showReqForm ? (
        <form onSubmit={handleSendRequest} className="mt-2.5 rounded-xl bg-blue-50/70 p-3">
          <label className="block text-xs font-semibold text-blue-900">
            Ask assigned team members for an update:
          </label>
          <textarea
            value={reqMessage}
            onChange={(e) => setReqMessage(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-blue-200 bg-white p-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            placeholder="What's the status on this?"
            required
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={threadBusy}
              onClick={() => setShowReqForm(false)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={threadBusy || !reqMessage.trim()}
              className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {threadBusy ? "Sending..." : "Send Request"}
            </button>
          </div>
        </form>
      ) : null}

      {threadError ? (
        <p className="mt-2 text-xs text-red-600">{threadError}</p>
      ) : null}

      {/* Collapsible Thread List */}
      {expanded && threadCount > 0 ? (
        <div className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          {topRequests.map((req) => {
            const replies = threads.filter(
              (t) => t.type === "reply" && t.parent_id === req.id
            );

            return (
              <div key={req.id} className="space-y-2 rounded-lg bg-white p-2.5 shadow-2xs border border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-800">{req.author_name}</span>
                  <span>{formatWhen(req.created_at)}</span>
                </div>
                <p className="text-xs text-slate-700">{req.content}</p>

                {/* Replies */}
                {replies.length > 0 ? (
                  <div className="mt-2 space-y-2 border-l-2 border-blue-200 pl-3">
                    {replies.map((reply) => (
                      <div key={reply.id} className="rounded-md bg-slate-50 p-2 text-xs">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700">{reply.author_name}</span>
                          <span>{formatWhen(reply.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-slate-700">{reply.content}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Reply action button & form */}
                {open && onReplyUpdate ? (
                  <div className="mt-2 pt-1">
                    {replyingToId === req.id ? (
                      <form onSubmit={(e) => handleSendReply(e, req.id)} className="space-y-1.5">
                        <input
                          type="text"
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          placeholder="Write a reply update..."
                          className="w-full rounded-md border border-slate-300 p-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                          required
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={threadBusy}
                            onClick={() => {
                              setReplyingToId(null);
                              setReplyMessage("");
                            }}
                            className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={threadBusy || !replyMessage.trim()}
                            className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {threadBusy ? "Posting..." : "Reply"}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToId(req.id);
                          setReplyMessage("");
                        }}
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        ↩ Reply
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

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
