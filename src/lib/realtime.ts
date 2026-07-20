import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

const DEBOUNCE_MS = 250;

export type PaymentsRealtimeHandlers = {
  /** Full reload fallback (online / visibility / unhandled events). */
  onRefresh: () => void;
  /** Apply a postgres change without a network round-trip when possible. */
  onRow?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => boolean;
};

/**
 * Subscribe to payments table changes.
 * Prefer onRow patches; debounce full refresh only when patching is insufficient.
 */
export function subscribePayments(handlers: PaymentsRealtimeHandlers): () => void {
  const { onRefresh, onRow } = handlers;
  const supabase = getSupabaseBrowserClient();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let alive = true;

  const scheduleRefresh = () => {
    if (!alive) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (alive) onRefresh();
    }, DEBOUNCE_MS);
  };

  const onChange = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
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

  let channel: RealtimeChannel | null = supabase
    .channel("payments-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      onChange
    )
    .subscribe();

  const onOnline = () => scheduleRefresh();
  const onVisible = () => {
    if (document.visibilityState === "visible") scheduleRefresh();
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
