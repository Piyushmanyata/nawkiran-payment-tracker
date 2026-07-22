"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sendTestNotification,
  subscribeUser,
} from "@/app/actions/push";
import {
  configurePushServiceWorker,
  getDeviceInfo,
  getPushSubscription,
  isPushBrowserSupported,
  registerPushServiceWorker,
  serializePushSubscription,
} from "@/lib/push-client";

type Status =
  | "loading"
  | "unsupported"
  | "ios-install"
  | "denied"
  | "off"
  | "on"
  | "hidden";

/** Public VAPID key is already browser-safe — no server round-trip. */
function getClientPushPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
  if (key && key.startsWith("your_")) return null;
  return key;
}

async function saveSubscription(sub: PushSubscription): Promise<string | null> {
  const result = await subscribeUser(
    serializePushSubscription(sub),
    navigator.userAgent
  );
  return result.success ? null : (result.error ?? "Could not save subscription");
}

/**
 * Compact enable/disable control for free Web Push.
 * iOS: only works after Add to Home Screen (standalone).
 */
export function PushNotifications() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [device, setDevice] = useState(() => getDeviceInfo());

  const refresh = useCallback(async () => {
    const info = getDeviceInfo();
    setDevice(info);

    const publicKey = getClientPushPublicKey();
    if (!publicKey) {
      setStatus("hidden");
      return;
    }

    // iOS Safari (not installed): PushManager often missing — still show install help
    if (info.isIos && !info.isStandalone) {
      setStatus("ios-install");
      return;
    }

    if (!isPushBrowserSupported()) {
      setStatus(info.isIos ? "ios-install" : "unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    try {
      const reg = await registerPushServiceWorker();
      configurePushServiceWorker(reg, publicKey);
      const sub = await getPushSubscription(
        reg,
        publicKey,
        Notification.permission === "granted"
      );
      if (sub) {
        // Re-upsert so a wiped DB / rotated endpoint still receives pushes
        const error = await saveSubscription(sub);
        if (error) {
          setHint(error);
          setStatus("off");
        } else {
          setStatus("on");
        }
      } else if (Notification.permission === "granted") {
        // Permission already granted but no sub (SW update, cleared storage)
        setStatus("off");
      } else {
        setStatus("off");
      }
    } catch {
      setStatus(info.isIos ? "ios-install" : "unsupported");
    }
  }, []);

  const resubscribeQuiet = useCallback(async () => {
    try {
      const publicKey = getClientPushPublicKey();
      if (!publicKey || !isPushBrowserSupported()) return;
      if (Notification.permission !== "granted") return;

      const reg = await registerPushServiceWorker();
      configurePushServiceWorker(reg, publicKey);
      const sub = await getPushSubscription(reg, publicKey, true);
      if (!sub) return;
      const error = await saveSubscription(sub);
      if (!error) setStatus("on");
    } catch {
      /* optional path */
    }
  }, []);

  useEffect(() => {
    const ric = window.requestIdleCallback?.bind(window);
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const run = () => void refresh();
    if (ric) {
      idleId = ric(run, { timeout: 1800 });
    } else {
      timeoutId = window.setTimeout(run, 1);
    }

    // After Add to Home Screen, re-check when display mode becomes standalone
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => void refresh();
    mq.addEventListener?.("change", onMode);

    // SW asks for re-subscribe after endpoint rotation; also deep-link nav
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (type === "nawkiran-push-resubscribe") {
        void resubscribeQuiet();
      }
      if (type === "nawkiran-navigate" && typeof event.data?.url === "string") {
        window.location.assign(event.data.url);
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
    }

    return () => {
      if (idleId !== undefined && window.cancelIdleCallback) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      mq.removeEventListener?.("change", onMode);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMessage);
      }
    };
  }, [refresh, resubscribeQuiet]);

  async function enable() {
    setBusy(true);
    setHint(null);
    try {
      const info = getDeviceInfo();
      setDevice(info);

      if (info.isIos && !info.isStandalone) {
        setStatus("ios-install");
        setHint(
          "On iPhone: Share → Add to Home Screen, open the app icon, then Enable."
        );
        return;
      }

      const publicKey = getClientPushPublicKey();
      if (!publicKey) {
        setHint("Push is not configured on the server.");
        return;
      }

      if (!isPushBrowserSupported()) {
        setStatus("unsupported");
        setHint("This browser does not support push alerts.");
        return;
      }

      // Register SW before permission/subscribe — ready alone can race on mobile
      const reg = await registerPushServiceWorker();
      configurePushServiceWorker(reg, publicKey);

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const sub = await getPushSubscription(reg, publicKey, true);
      if (!sub) throw new Error("Could not create a push subscription");

      const err = await saveSubscription(sub);
      if (err) {
        setHint(err);
        await sub.unsubscribe().catch(() => {});
        return;
      }

      const test = await sendTestNotification(sub.endpoint);
      if (test.success) {
        setStatus("on");
        setHint("Test alert sent — this device is ready.");
      } else {
        setStatus("off");
        setHint("The test alert failed. Tap Enable to retry.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not enable alerts";
      // iOS often throws until installed as PWA
      if (device.isIos || /permission|denied|not supported/i.test(msg)) {
        setHint(
          device.isIos
            ? "Install to Home Screen first, then open the app icon and enable alerts."
            : msg
        );
      } else {
        setHint(msg);
      }
    } finally {
      setBusy(false);
    }
  }


  // Hide when unsupported, or once push setup finished successfully.
  if (
    status === "loading" ||
    status === "hidden" ||
    status === "unsupported" ||
    status === "on"
  ) {
    return null;
  }

  const title =
    status === "denied"
      ? "Alerts blocked in browser"
      : status === "ios-install"
        ? "Install app for alerts"
        : "Get payment alerts";

  const subtitle =
    status === "denied"
      ? "Allow notifications in browser settings"
      : status === "ios-install"
        ? "Share → Add to Home Screen, then open the icon"
        : "Free · works when the app is closed";

  return (
    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
        </div>
        {status === "denied" || status === "ios-install" ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void enable()}
            className="min-h-9 shrink-0 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50"
          >
            {busy ? "…" : "Enable"}
          </button>
        )}
      </div>
      {hint ? (
        <p className="mx-auto mt-1 max-w-lg text-[11px] text-amber-800">{hint}</p>
      ) : null}
    </div>
  );
}
