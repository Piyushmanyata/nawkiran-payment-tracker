"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPushPublicKey,
  subscribeUser,
  unsubscribeUser,
} from "@/app/actions/push";
import {
  isPushBrowserSupported,
  serializePushSubscription,
  urlBase64ToUint8Array,
} from "@/lib/push-client";

type Status = "loading" | "unsupported" | "denied" | "off" | "on" | "hidden";

function getDeviceInfo() {
  if (typeof window === "undefined") {
    return { isIos: false, isStandalone: true };
  }

  return {
    isIos:
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream?: unknown }).MSStream,
    isStandalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari legacy
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  };
}

/**
 * Compact enable/disable control for free Web Push.
 * iOS: only works after Add to Home Screen (standalone).
 */
export function PushNotifications() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const { isIos, isStandalone } = getDeviceInfo();

  const refresh = useCallback(async () => {
    if (!isPushBrowserSupported()) {
      setStatus("unsupported");
      return;
    }

    const publicKey = await getPushPublicKey();
    if (!publicKey) {
      setStatus("hidden");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setHint(null);
    try {
      if (isIos && !isStandalone) {
        setHint(
          "On iPhone: Share → Add to Home Screen, open the app icon, then enable alerts."
        );
        setBusy(false);
        return;
      }

      const publicKey = await getPushPublicKey();
      if (!publicKey) {
        setHint("Push is not configured on the server.");
        setBusy(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        setBusy(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          publicKey
        ) as BufferSource,
      });

      const result = await subscribeUser(
        serializePushSubscription(sub),
        navigator.userAgent
      );
      if (!result.success) {
        setHint(result.error ?? "Could not save subscription");
        await sub.unsubscribe().catch(() => {});
        setBusy(false);
        return;
      }

      setStatus("on");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Could not enable alerts");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setHint(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeUser(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Could not disable alerts");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "hidden" || status === "unsupported") {
    return null;
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700">
            {status === "on"
              ? "Push alerts on"
              : status === "denied"
                ? "Alerts blocked in browser"
                : "Get payment alerts"}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {status === "on"
              ? "You’ll be notified on this device"
              : status === "denied"
                ? "Allow notifications in browser settings"
                : isIos && !isStandalone
                  ? "Install to Home Screen first (iOS)"
                  : "Free · works when the app is closed"}
          </p>
        </div>
        {status === "on" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void disable()}
            className="min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold text-slate-600 transition hover:bg-white active:bg-slate-100 disabled:opacity-50"
          >
            Turn off
          </button>
        ) : status === "denied" ? null : (
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
