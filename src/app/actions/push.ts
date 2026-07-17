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
import { createClient } from "@/utils/supabase/server";
import type { Payment } from "@/types/database";

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: String(row.id),
    party: String(row.party),
    amount: row.amount as number | string,
    due_date: (row.due_date as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    status: row.status as Payment["status"],
    requested_by: String(row.requested_by),
    requested_at: String(row.requested_at),
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    denied_by: (row.denied_by as string | null) ?? null,
    denied_at: (row.denied_at as string | null) ?? null,
    denial_reason: (row.denial_reason as string | null) ?? null,
    paid_by: (row.paid_by as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    payment_mode: (row.payment_mode as string | null) ?? null,
    payment_reference: (row.payment_reference as string | null) ?? null,
    updated_at: String(row.updated_at),
    version: Number(row.version ?? 1),
    client_request_id: String(row.client_request_id),
  };
}

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
      .select("*")
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
