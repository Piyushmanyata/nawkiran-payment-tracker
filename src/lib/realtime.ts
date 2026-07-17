import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Subscribe to payments table changes. Calls onChange on any insert/update/delete.
 * Also wires online + visibility refresh as Realtime fallback.
 */
export function subscribePayments(onChange: () => void): () => void {
  const supabase = getSupabaseBrowserClient();

  let channel: RealtimeChannel | null = supabase
    .channel("payments-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "payments" },
      () => onChange()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
        // Re-pull after reconnect / error recovery
        if (status === "SUBSCRIBED") onChange();
      }
    });

  const onOnline = () => onChange();
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
