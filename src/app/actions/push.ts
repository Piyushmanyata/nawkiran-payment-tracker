"use server";

import {
  buildPushPayload,
  isPushConfigured,
  removePushSubscription,
  savePushSubscription,
  sendPaymentPush,
  type PushEvent,
  type SerializedPushSubscription,
} from "@/lib/push";
import { mapPayment } from "@/lib/map-payment";
import { createClient } from "@/utils/supabase/server";

export async function getPushPublicKey(): Promise<string | null> {
  if (!isPushConfigured()) return null;
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

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

/**
 * Fire-and-forget friendly: notify role targets after a payment lifecycle change.
 * Safe to ignore failures — payment already succeeded.
 */
export async function notifyPaymentEvent(
  paymentId: string,
  event: PushEvent
): Promise<{ success: boolean; sent?: number; error?: string }> {
  try {
    if (!isPushConfigured()) {
      return { success: true, sent: 0 };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not signed in" };
    }

    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, party, amount, due_date, purpose, status, requested_by, requested_at, approved_by, approved_at, denied_by, denied_at, denial_reason, paid_by, paid_at, payment_mode, payment_reference, updated_at, version, client_request_id"
      )
      .eq("id", paymentId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return { success: false, error: "Payment not found" };

    const payment = mapPayment(data as Record<string, unknown>);
    const payload = buildPushPayload(event, payment);
    const result = await sendPaymentPush(paymentId, event, payload);
    return { success: true, sent: result.sent };
  } catch (err) {
    console.error("notifyPaymentEvent", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}
