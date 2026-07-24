"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingButton } from "@/components/LoadingButton";
import { PageLoading } from "@/components/PageLoading";
import { TodoCard } from "@/components/TodoCard";
import { TodoForm } from "@/components/TodoForm";
import { userMessageFromError } from "@/lib/errors";
import {
  completeTodo,
  createTodo,
  deleteTodo,
  fetchActiveProfiles,
  fetchTodos,
  isMineTodo,
  maybeNotifyOverdueTodos,
  maybePurgeOldTodos,
  requestTodoUpdate,
  replyTodoUpdate,
  sortDoneTodos,
  sortOpenTodos,
  updateTodo,
} from "@/lib/todos";
import {
  notifyTodoUpdateRequest,
  notifyTodoUpdateReply,
} from "@/app/actions/push";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Profile, Todo } from "@/types/database";

const Modal = dynamic(() =>
  import("@/components/Modal").then((mod) => mod.Modal)
);

type Filter = "open" | "done" | "mine";

const FILTERS = [
  ["open", "Open"],
  ["done", "Done"],
  ["mine", "Mine"],
] as const;

export default function TodoPage() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  const userId = profile?.id ?? null;

  const [todos, setTodos] = useState<Todo[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Todo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchTodos();
      setTodos(rows);
      setError(null);
    } catch (err) {
      setError(userMessageFromError(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [rows, people] = await Promise.all([
          fetchTodos(),
          fetchActiveProfiles(),
        ]);
        if (cancelled) return;
        setTodos(rows);
        setProfiles(people);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(userMessageFromError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const n = await maybePurgeOldTodos();
      void maybeNotifyOverdueTodos();
      if (!cancelled && n > 0) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("todos-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos" },
        () => {
          void reload();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  const openCount = useMemo(
    () => todos.filter((t) => t.status === "open").length,
    [todos]
  );

  const visible = useMemo(() => {
    if (filter === "open") {
      return sortOpenTodos(todos.filter((t) => t.status === "open"));
    }
    if (filter === "done") {
      return sortDoneTodos(todos.filter((t) => t.status === "done"));
    }
    // Mine on open by default feel: show open mine first list of open+done mine
    const mine = todos.filter((t) => isMineTodo(t, userId));
    const open = sortOpenTodos(mine.filter((t) => t.status === "open"));
    const done = sortDoneTodos(mine.filter((t) => t.status === "done"));
    return [...open, ...done];
  }, [todos, filter, userId]);

  function upsertLocal(todo: Todo) {
    setTodos((prev) => {
      const rest = prev.filter((t) => t.id !== todo.id);
      return [todo, ...rest];
    });
  }

  function removeLocal(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  async function doCreate(input: {
    title: string;
    dueDate: string | null;
    priority: "normal" | "urgent";
    assigneeIds: string[];
  }) {
    setFormBusy(true);
    setFormError(null);
    try {
      const todo = await createTodo({
        title: input.title,
        dueDate: input.dueDate,
        priority: input.priority,
        assigneeIds: input.assigneeIds,
      });
      upsertLocal({
        ...todo,
        creator_name: profile?.full_name ?? todo.creator_name,
      });
      setShowCreate(false);
    } catch (err) {
      setFormError(userMessageFromError(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function doEdit(input: {
    title: string;
    dueDate: string | null;
    priority: "normal" | "urgent";
    assigneeIds: string[];
  }) {
    if (!editTarget) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const todo = await updateTodo({
        todoId: editTarget.id,
        title: input.title,
        dueDate: input.dueDate,
        priority: input.priority,
        assigneeIds: input.assigneeIds,
      });
      upsertLocal(todo);
      setEditTarget(null);
    } catch (err) {
      setFormError(userMessageFromError(err));
    } finally {
      setFormBusy(false);
    }
  }

  async function doComplete(todo: Todo) {
    setBusyId(todo.id);
    try {
      const updated = await completeTodo(todo.id);
      upsertLocal({
        ...updated,
        completer_name: profile?.full_name ?? updated.completer_name,
      });
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const id = deleteTarget.id;
      await deleteTodo(id);
      removeLocal(id);
      setDeleteTarget(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function doRequestUpdate(todo: Todo, message: string) {
    const updated = await requestTodoUpdate(todo.id, message);
    upsertLocal(updated);
    void notifyTodoUpdateRequest(todo.id, todo.title, message);
  }

  async function doReplyUpdate(todo: Todo, parentId: string, message: string) {
    const updated = await replyTodoUpdate(todo.id, parentId, message);
    upsertLocal(updated);
    const parentReq = updated.threads?.find((t) => t.id === parentId);
    const assignees = (updated.assignees ?? []).map((a) => a.id);
    const targets = Array.from(
      new Set(
        [parentReq?.author_id, updated.created_by, ...assignees].filter(
          Boolean
        ) as string[]
      )
    );
    void notifyTodoUpdateReply(todo.id, todo.title, targets, message);
  }

  if (loading && todos.length === 0) {
    return <PageLoading label="Loading to-dos..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            To-do
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Shared team checklist · {openCount} open
          </p>
        </div>
        <LoadingButton
          variant="primary"
          className="!w-auto shrink-0 px-4"
          onClick={() => {
            setFormError(null);
            setShowCreate(true);
          }}
        >
          Add
        </LoadingButton>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter to-dos">
        {FILTERS.map(([value, label]) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setError(null);
            void reload();
          }}
        />
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          text={
            filter === "done"
              ? "No completed to-dos yet."
              : filter === "mine"
                ? "Nothing assigned to you or created by you."
                : "No open to-dos. Tap Add to create one."
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visible.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              role={role}
              userId={userId}
              busy={busyId === t.id}
              onComplete={t.status === "open" ? doComplete : undefined}
              onEdit={
                t.status === "open"
                  ? (todo) => {
                      setFormError(null);
                      setEditTarget(todo);
                    }
                  : undefined
              }
              onDelete={setDeleteTarget}
              onRequestUpdate={t.status === "open" ? doRequestUpdate : undefined}
              onReplyUpdate={t.status === "open" ? doReplyUpdate : undefined}
            />
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        titleId="todo-create-title"
        title="Add to-do"
        onClose={() => setShowCreate(false)}
        disableClose={formBusy}
      >
        <div className="mt-3">
          <TodoForm
            profiles={profiles}
            loading={formBusy}
            error={formError}
            onCancel={() => setShowCreate(false)}
            onSubmit={(input) => void doCreate(input)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(editTarget)}
        titleId="todo-edit-title"
        title="Edit to-do"
        onClose={() => setEditTarget(null)}
        disableClose={formBusy}
      >
        <div className="mt-3">
          <TodoForm
            profiles={profiles}
            initial={editTarget}
            loading={formBusy}
            error={formError}
            onCancel={() => setEditTarget(null)}
            onSubmit={(input) => void doEdit(input)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        titleId="todo-delete-title"
        title="Delete to-do?"
        onClose={() => setDeleteTarget(null)}
        disableClose={Boolean(busyId)}
      >
        <p className="mt-2 text-base text-slate-700">
          Remove “{deleteTarget?.title}”? This cannot be undone.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton
            variant="secondary"
            disabled={Boolean(busyId)}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            variant="danger"
            loading={Boolean(busyId)}
            loadingText="Deleting..."
            onClick={() => void doDelete()}
          >
            Delete
          </LoadingButton>
        </div>
      </Modal>
    </div>
  );
}
