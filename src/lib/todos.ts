import { notifyMyOverdueTodos, notifyTodoAssigned } from "@/app/actions/push";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Profile, Todo, TodoPriority } from "@/types/database";

function asTodo(raw: unknown): Todo {
  const row = (raw ?? {}) as Record<string, unknown>;
  const assigneesRaw = Array.isArray(row.assignees) ? row.assignees : [];
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    priority: (row.priority === "urgent" ? "urgent" : "normal") as TodoPriority,
    due_date: (row.due_date as string | null) ?? null,
    status: row.status === "done" ? "done" : "open",
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at ?? ""),
    completed_by: (row.completed_by as string | null) ?? null,
    completed_at: (row.completed_at as string | null) ?? null,
    creator_name: (row.creator_name as string | null) ?? null,
    completer_name: (row.completer_name as string | null) ?? null,
    assignees: assigneesRaw
      .map((a) => {
        const x = a as Record<string, unknown>;
        return {
          id: String(x.id ?? ""),
          full_name: String(x.full_name ?? ""),
        };
      })
      .filter((a) => a.id),
    newly_assigned: Array.isArray(row.newly_assigned)
      ? (row.newly_assigned as string[])
      : undefined,
  };
}

function asTodoList(data: unknown): Todo[] {
  if (data == null) return [];
  if (typeof data === "string") {
    try {
      return asTodoList(JSON.parse(data));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.map(asTodo).filter((t) => t.id);
}

/** Urgent first, earliest due (nulls last), newest created. */
export function sortOpenTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) => {
    const pu = (a.priority === "urgent" ? 0 : 1) - (b.priority === "urgent" ? 0 : 1);
    if (pu !== 0) return pu;
    if (a.due_date && b.due_date) {
      if (a.due_date < b.due_date) return -1;
      if (a.due_date > b.due_date) return 1;
    } else if (a.due_date && !b.due_date) return -1;
    else if (!a.due_date && b.due_date) return 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function sortDoneTodos(todos: Todo[]): Todo[] {
  return [...todos].sort((a, b) =>
    (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
  );
}

export function isMineTodo(todo: Todo, userId: string | null | undefined): boolean {
  if (!userId) return false;
  if (todo.created_by === userId) return true;
  return todo.assignees.some((a) => a.id === userId);
}

function queueAssignPush(todo: Todo): void {
  const ids = todo.newly_assigned?.filter(Boolean) ?? [];
  if (ids.length === 0) return;
  void notifyTodoAssigned(todo.id, todo.title, ids).catch(() => {
    console.warn("To-do saved, but assign push was not queued");
  });
}

export async function fetchTodos(): Promise<Todo[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("list_todos_ui");
  if (error) throw error;
  return asTodoList(data);
}

export async function fetchActiveProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .eq("active", true)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function createTodo(input: {
  title: string;
  dueDate?: string | null;
  priority?: TodoPriority;
  assigneeIds?: string[];
}): Promise<Todo> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_todo", {
    p_title: input.title,
    p_due_date: input.dueDate || null,
    p_priority: input.priority ?? "normal",
    p_assignee_ids: input.assigneeIds ?? [],
  });
  if (error) throw error;
  const todo = asTodo(data);
  queueAssignPush(todo);
  return todo;
}

export async function updateTodo(input: {
  todoId: string;
  title: string;
  dueDate?: string | null;
  priority?: TodoPriority;
  assigneeIds?: string[];
}): Promise<Todo> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("update_todo", {
    p_todo_id: input.todoId,
    p_title: input.title,
    p_due_date: input.dueDate || null,
    p_priority: input.priority ?? "normal",
    p_assignee_ids: input.assigneeIds ?? [],
  });
  if (error) throw error;
  const todo = asTodo(data);
  queueAssignPush(todo);
  return todo;
}

export async function completeTodo(todoId: string): Promise<Todo> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("complete_todo", {
    p_todo_id: todoId,
  });
  if (error) throw error;
  return asTodo(data);
}

export async function deleteTodo(todoId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("delete_todo", {
    p_todo_id: todoId,
  });
  if (error) throw error;
}

export async function requestTodoUpdate(
  todoId: string,
  content: string
): Promise<Todo> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("request_todo_update", {
    p_todo_id: todoId,
    p_content: content,
  });
  if (error) throw error;
  return data as unknown as Todo;
}

export async function replyTodoUpdate(
  todoId: string,
  parentId: string,
  content: string
): Promise<Todo> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("reply_todo_update", {
    p_todo_id: todoId,
    p_parent_id: parentId,
    p_content: content,
  });
  if (error) throw error;
  return data as unknown as Todo;
}

export const TODO_KEEP_DAYS = 30;
const PURGE_FLAG = "nk_todo_purge_at";
const PURGE_EVERY_MS = 12 * 60 * 60 * 1000;

export async function purgeOldTodos(keepDays = TODO_KEEP_DAYS): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("purge_old_todos", {
    p_keep_days: keepDays,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function maybePurgeOldTodos(): Promise<number> {
  try {
    const last = Number(
      typeof localStorage !== "undefined"
        ? localStorage.getItem(PURGE_FLAG) || 0
        : 0
    );
    if (Date.now() - last < PURGE_EVERY_MS) return 0;
    const n = await purgeOldTodos(TODO_KEEP_DAYS);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PURGE_FLAG, String(Date.now()));
    }
    return n;
  } catch {
    return 0;
  }
}

const OVERDUE_FLAG = "nk_todo_overdue_day";

/** At most one overdue digest push per local calendar day. */
export async function maybeNotifyOverdueTodos(): Promise<number> {
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (typeof localStorage !== "undefined") {
      if (localStorage.getItem(OVERDUE_FLAG) === day) return 0;
    }
    const result = await notifyMyOverdueTodos();
    if (typeof localStorage !== "undefined" && result.success) {
      localStorage.setItem(OVERDUE_FLAG, day);
    }
    return result.count ?? 0;
  } catch {
    return 0;
  }
}
