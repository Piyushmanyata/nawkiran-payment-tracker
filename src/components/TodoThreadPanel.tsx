"use client";

import { useMemo, useState } from "react";
import type { Todo, TodoThread } from "@/types/database";
import { formatWhen } from "@/lib/format";

export function TodoThreadPanel({
  todo,
  onRequestUpdate,
  onReplyUpdate,
}: {
  todo: Todo;
  onRequestUpdate?: (t: Todo, message: string) => Promise<void>;
  onReplyUpdate?: (t: Todo, parentId: string, message: string) => Promise<void>;
}) {
  const open = todo.status === "open";
  const threadCount = todo.threads?.length ?? 0;
  const { topRequests, repliesByParent } = useMemo(() => {
    const requests: TodoThread[] = [];
    const byParent = new Map<string, TodoThread[]>();
    for (const t of todo.threads ?? []) {
      if (t.type === "request") {
        requests.push(t);
      } else if (t.parent_id) {
        const list = byParent.get(t.parent_id);
        if (list) list.push(t);
        else byParent.set(t.parent_id, [t]);
      }
    }
    return { topRequests: requests, repliesByParent: byParent };
  }, [todo.threads]);

  const [expanded, setExpanded] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!requestMessage.trim() || !onRequestUpdate) return;
    setThreadBusy(true);
    setThreadError(null);
    try {
      await onRequestUpdate(todo, requestMessage.trim());
      setShowRequestForm(false);
      setExpanded(true);
      setRequestMessage("");
    } catch (err) {
      setThreadError(
        err instanceof Error ? err.message : "Failed to send update request"
      );
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
      setThreadError(
        err instanceof Error ? err.message : "Failed to send reply"
      );
    } finally {
      setThreadBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {/* Thread Controls & Toggle Bar */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        {threadCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
          >
            <span>
              💬 {threadCount} {threadCount === 1 ? "update" : "updates"}
            </span>
            <span>{expanded ? "▲" : "▼"}</span>
          </button>
        ) : (
          <span className="text-slate-400">No updates requested</span>
        )}

        {open && onRequestUpdate ? (
          <button
            type="button"
            onClick={() => setShowRequestForm(!showRequestForm)}
            className="font-semibold text-slate-700 hover:text-blue-600"
          >
            Request Update
          </button>
        ) : null}
      </div>

      {/* Inline Request Form */}
      {showRequestForm ? (
        <form
          onSubmit={handleSendRequest}
          className="mt-2.5 rounded-xl bg-blue-50/70 p-3"
        >
          <label className="block text-xs font-semibold text-blue-900">
            Ask assigned team members for an update:
          </label>
          <textarea
            value={requestMessage}
            onChange={(e) => setRequestMessage(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-blue-200 bg-white p-2 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
            placeholder="What's the status on this?"
            required
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={threadBusy}
              onClick={() => setShowRequestForm(false)}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={threadBusy || !requestMessage.trim()}
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
            const replies = repliesByParent.get(req.id) ?? [];

            return (
              <div
                key={req.id}
                className="space-y-2 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-2xs"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-800">
                    {req.author_name}
                  </span>
                  <span>{formatWhen(req.created_at)}</span>
                </div>
                <p className="text-xs text-slate-700">{req.content}</p>

                {/* Replies */}
                {replies.length > 0 ? (
                  <div className="mt-2 space-y-2 border-l-2 border-blue-200 pl-3">
                    {replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="rounded-md bg-slate-50 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700">
                            {reply.author_name}
                          </span>
                          <span>{formatWhen(reply.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-slate-700">
                          {reply.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Reply action button & form */}
                {open && onReplyUpdate ? (
                  <div className="mt-2 pt-1">
                    {replyingToId === req.id ? (
                      <form
                        onSubmit={(e) => handleSendReply(e, req.id)}
                        className="space-y-1.5"
                      >
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
    </div>
  );
}
