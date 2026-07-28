import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

const DEBOUNCE_MS = 400;
/** Tab-focus refetches are throttled here; providers throttle again by freshness. */
const VISIBLE_THROTTLE_MS = 15_000;

export type RowPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

export type RealtimeHandlers = {
  /** Full reload fallback (online / visibility / unhandled events). */
  onRefresh: () => void;
  /** Apply a postgres change without a network round-trip when possible. */
  onRow?: (payload: RowPayload) => boolean;
};

/**
 * One Realtime channel per logical dataset.
 *
 * Prefer `onRow` patches; a debounced full refresh is the fallback for events
 * a patch cannot express (and for reconnects). Every subscriber of a dataset
 * must share a single channel — duplicated channels multiply both socket
 * traffic and refetches.
 */
export function subscribeTables(
  channelName: string,
  tables: readonly string[],
  handlers: RealtimeHandlers
): () => void {
  const { onRefresh, onRow } = handlers;
  const supabase = getSupabaseBrowserClient();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let alive = true;
  let lastVisibleRefresh = 0;

  const scheduleRefresh = () => {
    if (!alive) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (alive) onRefresh();
    }, DEBOUNCE_MS);
  };

  const onChange = (payload: RowPayload) => {
    if (!alive) return;
    if (onRow) {
      try {
        if (onRow(payload)) return;
      } catch {
        // fall through to refresh
      }
    }
    scheduleRefresh();
  };

  let channel: RealtimeChannel | null = supabase.channel(channelName);
  for (const table of tables) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      onChange
    );
  }
  channel.subscribe();

  const onOnline = () => scheduleRefresh();
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastVisibleRefresh < VISIBLE_THROTTLE_MS) return;
    lastVisibleRefresh = now;
    scheduleRefresh();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    alive = false;
    if (timer) clearTimeout(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}

export const subscribePayments = (handlers: RealtimeHandlers) =>
  subscribeTables("payments-live", ["payments"], handlers);

/** To-do rows and their threads always move together — one channel covers both. */
export const subscribeTodos = (handlers: RealtimeHandlers) =>
  subscribeTables("todos-live", ["todos", "todo_threads"], handlers);
