import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

const DEBOUNCE_MS = 120;

/**
 * Subscribe to payments table changes. Debounces bursts (multi-row writes,
 * reconnect + visibility) into one refresh. Online/visibility are fallbacks
 * when Realtime drops.
 */
export function subscribePayments(onChange: () => void): () => void {
  const supabase = getSupabaseBrowserClient();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let alive = true;

  const schedule = () => {
    if (!alive) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (alive) onChange();
    }, DEBOUNCE_MS);
  };

  let channel: RealtimeChannel | null = supabase
    .channel("payments-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      schedule
    )
    .subscribe();

  const onOnline = () => schedule();
  const onVisible = () => {
    if (document.visibilityState === "visible") schedule();
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
