"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchTodos } from "@/lib/todos";
import { subscribeTodos } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import type { Todo } from "@/types/database";

interface TodosState {
  todos: Todo[];
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  upsertTodo: (todo: Todo) => void;
  removeTodo: (id: string) => void;
}

const TodosContext = createContext<TodosState | null>(null);

const FRESH_MS = 30_000;

/**
 * App-wide to-dos + one Realtime channel, shared by the /todo board and the
 * nav badge. To-dos carry nested assignees and threads, so a changed row is
 * refetched rather than patched from the payload.
 */
export function TodosProvider({ children }: { children: ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestVersion = useRef(0);
  const lastLoadAt = useRef(0);
  const hasData = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (
      opts?.silent &&
      !opts.force &&
      lastLoadAt.current &&
      performance.now() - lastLoadAt.current < FRESH_MS
    ) {
      return;
    }
    const version = ++requestVersion.current;
    try {
      const rows = await fetchTodos();
      if (version !== requestVersion.current) return;
      setTodos(rows);
      hasData.current = true;
      setError(null);
      lastLoadAt.current = performance.now();
    } catch (err) {
      if (version !== requestVersion.current) return;
      if (!hasData.current) setError(userMessageFromError(err));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  const upsertTodo = useCallback((todo: Todo) => {
    setTodos((prev) => [todo, ...prev.filter((t) => t.id !== todo.id)]);
    hasData.current = true;
  }, []);

  const removeTodo = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    // Defer the first fetch a tick so the effect body never sets state inline.
    const kick = window.setTimeout(() => void load({ force: true }), 0);
    const unsubscribe = subscribeTodos({
      onRefresh: () => void load({ silent: true }),
    });
    return () => {
      requestVersion.current += 1;
      window.clearTimeout(kick);
      unsubscribe();
    };
  }, [load]);

  const reload = useCallback(() => load({ force: true }), [load]);

  const value = useMemo(
    () => ({ todos, loading, error, setError, reload, upsertTodo, removeTodo }),
    [todos, loading, error, reload, upsertTodo, removeTodo]
  );

  return <TodosContext.Provider value={value}>{children}</TodosContext.Provider>;
}

export function useTodos(): TodosState {
  const ctx = useContext(TodosContext);
  if (!ctx) throw new Error("useTodos must be used within TodosProvider");
  return ctx;
}
