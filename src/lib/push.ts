import "server-only";
import webpush from "web-push";
import { createClient } from "@/utils/supabase/server";
import { formatInr } from "@/lib/format";
import type { PushEvent } from "@/lib/push-client";
import type { Payment } from "@/types/database";

export type { PushEvent };

export type SerializedPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY
  );
}

function ensureVapid(): boolean {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@nawkiran.local",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return true;
}

export function isPushConfigured(): boolean {
  return vapidConfigured();
}

export function publicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

/** Build title/body for a payment lifecycle event. */
export function buildPushPayload(
  event: PushEvent,
  payment: Pick<Payment, "party" | "amount" | "denial_reason">
): { title: string; body: string; url: string } {
  const amount = formatInr(payment.amount);
  const party = payment.party;

  switch (event) {
    case "pending":
      return {
        title: "New payment request",
        body: `${party} · ${amount} needs approval`,
        url: "/open",
      };
    case "approved":
      return {
        title: "Ready to pay",
        body: `${party} · ${amount} is outstanding`,
        url: "/open",
      };
    case "denied":
      return {
        title: "Payment denied",
        body: payment.denial_reason
          ? `${party} · ${amount} — ${payment.denial_reason}`
          : `${party} · ${amount}`,
        url: "/open",
      };
    case "paid":
      return {
        title: "Payment marked paid",
        body: `${party} · ${amount}`,
        url: "/history",
      };
    default:
      return {
        title: "Nawkiran Payments",
        body: `${party} · ${amount}`,
        url: "/open",
      };
  }
}

export async function savePushSubscription(
  sub: SerializedPushSubscription,
  userAgent?: string | null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: sub.keys.p256dh,
    p_auth: sub.keys.auth,
    p_user_agent: userAgent ?? null,
  });
  if (error) throw error;
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });
  if (error) throw error;
}

/** Load targets via security-definer RPC and send Web Push (free). */
export async function sendPaymentPush(
  paymentId: string,
  event: PushEvent,
  payload: { title: string; body: string; url: string }
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_push_targets", {
    p_payment_id: paymentId,
    p_event: event,
  });

  if (error) throw error;

  const targets = (data ?? []) as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }>;

  if (targets.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    url: payload.url,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: t.endpoint,
            keys: { p256dh: t.p256dh, auth: t.auth },
          },
          body,
          // high urgency helps mobile carriers deliver payment alerts promptly
          { TTL: 60 * 60 * 24, urgency: "high" }
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.rpc("delete_stale_push_subscription", {
            p_endpoint: t.endpoint,
          });
        }
      }
    })
  );

  return { sent, failed };
}
