"use server";

import { after } from "next/server";
import {
  buildPushPayload,
  isPushConfigured,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  sendPaymentPush,
  type PushEvent,
  type SerializedPushSubscription,
} from "@/lib/push";
import { createClient } from "@/utils/supabase/server";

export async function subscribeUser(
  sub: SerializedPushSubscription,
  userAgent?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      return { success: false, error: "Invalid subscription" };
    }
    await savePushSubscription(sub, userAgent);
    return { success: true };
  } catch (err) {
    console.error("subscribeUser", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Subscribe failed",
    };
  }
}

export async function unsubscribeUser(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!endpoint) return { success: false, error: "Missing endpoint" };
    await removePushSubscription(endpoint);
    return { success: true };
  } catch (err) {
    console.error("unsubscribeUser", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unsubscribe failed",
    };
  }
}

export async function sendTestNotification(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!endpoint) return { success: false, error: "Missing endpoint" };
    await sendTestPush(endpoint);
    return { success: true };
  } catch (err) {
    console.error("sendTestNotification", err);
    // The browser unsubscribes after a failed test; remove the matching server row too.
    await removePushSubscription(endpoint).catch((cleanupError) => {
      console.error("sendTestNotification cleanup", cleanupError);
    });
    return {
      success: false,
      error:
        err instanceof Error && /VAPID_SUBJECT/i.test(err.message)
          ? err.message
          : "Test notification failed",
    };
  }
}

/**
 * Fire-and-forget: notify role targets after a payment lifecycle change.
 * Safe to ignore failures — payment already succeeded.
 *
 * Routing (DB list_push_targets):
 *   pending  → director/admin
 *   approved → employee/accounts
 *   denied   → employee/accounts
 *   paid     → director/admin
 *
 * Copy (DB payment_push_context + buildPushPayload):
 *   pending  → Requested by …
 *   approved → Approved by …
 *   denied   → Denied by …
 *   paid     → Marked paid by …
 */
export async function notifyPaymentEvent(
  paymentId: string,
  event: PushEvent
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  try {
    if (!isPushConfigured()) {
      return { success: true, queued: false };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not signed in" };
    }

    // One RPC: party/amount + correct lifecycle actor name for this event.
    const { data, error } = await supabase.rpc("payment_push_context", {
      p_payment_id: paymentId,
      p_event: event,
    });

    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          party: string;
          amount: number | string;
          denial_reason: string | null;
          version: number | null;
          actor_name: string | null;
        }
      | null
      | undefined;

    if (!row?.party) {
      return { success: false, error: "Payment not found" };
    }

    const version = Number(row.version ?? 1);
    const payload = buildPushPayload(event, {
      party: row.party,
      amount: row.amount,
      actorName: row.actor_name?.trim() || "Someone",
      denialReason: row.denial_reason,
    });

    // Distinct tag per event type so OS keeps notifications separate
    // (does not replace "requested" with "paid" for the same payment).
    const tag = `nk:${payload.tagPrefix}:${paymentId}:v${version}`;

    after(async () => {
      try {
        const result = await sendPaymentPush(
          paymentId,
          event,
          {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag,
          },
          supabase
        );
        if (result.failed > 0) {
          console.error("notifyPaymentEvent delivery failures", {
            event,
            failed: result.failed,
            sent: result.sent,
          });
        }
      } catch (deliveryError) {
        console.error("notifyPaymentEvent delivery", deliveryError);
      }
    });
    return { success: true, queued: true };
  } catch (err) {
    console.error("notifyPaymentEvent", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}
