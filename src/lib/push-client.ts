/** Browser helpers for free Web Push (no third-party service). */

import type { Payment } from "@/types/database";

export type PushEvent = "pending" | "approved" | "denied" | "paid";

/**
 * Map a payment after an action to the push event to fire.
 * Director/admin create → auto-approved → "approved".
 */
export function pushEventForPayment(
  payment: Pick<Payment, "status">,
  action:
    | "created"
    | "approved"
    | "denied"
    | "paid"
    | "resubmitted"
): PushEvent | null {
  switch (action) {
    case "created":
      return payment.status === "approved" ? "approved" : "pending";
    case "resubmitted":
      return "pending";
    case "approved":
      return "approved";
    case "denied":
      return "denied";
    case "paid":
      return "paid";
    default:
      return null;
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushBrowserSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function serializePushSubscription(sub: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = sub.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh!,
      auth: json.keys!.auth!,
    },
  };
}

/** Best-effort notify after a successful payment RPC. Never throws. */
export function firePaymentPush(
  notify: (paymentId: string, event: PushEvent) => Promise<unknown>,
  paymentId: string,
  event: PushEvent
): void {
  void notify(paymentId, event).catch(() => {
    /* push is optional */
  });
}
