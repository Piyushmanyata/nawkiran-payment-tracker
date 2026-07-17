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

/** Decode VAPID key for PushManager.subscribe (Safari needs a plain ArrayBuffer-backed view). */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  // Detach from any SharedArrayBuffer quirks — copy into a fresh ArrayBuffer.
  return new Uint8Array(outputArray);
}

export function isPushBrowserSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getDeviceInfo(): { isIos: boolean; isStandalone: boolean } {
  if (typeof window === "undefined") {
    return { isIos: false, isStandalone: true };
  }

  const ua = navigator.userAgent;
  // iPadOS 13+ reports as Macintosh + touch
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return { isIos, isStandalone };
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

/** Register / reuse the app service worker (always call before push subscribe). */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  // Kick update check (mobile often keeps a stale SW after deploy)
  void reg.update().catch(() => {});
  await navigator.serviceWorker.ready;
  return reg;
}

/** Persist the public key in the worker so endpoint rotation works while closed. */
export function configurePushServiceWorker(
  reg: ServiceWorkerRegistration,
  publicKey: string
): void {
  (reg.active ?? navigator.serviceWorker.controller)?.postMessage({
    type: "nawkiran-push-config",
    publicKey,
  });
}

function subscriptionUsesKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options.applicationServerKey;
  if (!current) return false;
  const actual = new Uint8Array(current);
  const expected = urlBase64ToUint8Array(publicKey);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

/** Reuse a subscription only when it matches the deployed VAPID key. */
export async function getPushSubscription(
  reg: ServiceWorkerRegistration,
  publicKey: string,
  create: boolean
): Promise<PushSubscription | null> {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !subscriptionUsesKey(sub, publicKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  return sub;
}

/** Notify after a successful payment RPC; wait for server delivery before navigation. */
export async function firePaymentPush(
  notify: (
    paymentId: string,
    event: PushEvent
  ) => Promise<{ success: boolean; error?: string }>,
  paymentId: string,
  event: PushEvent
): Promise<boolean> {
  try {
    const result = await notify(paymentId, event);
    if (!result.success) console.warn("Payment saved, but push dispatch was not queued");
    return result.success;
  } catch {
    console.warn("Payment saved, but push dispatch was not queued");
    return false;
  }
}
