import "server-only";
import webpush from "web-push";
import { createClient } from "@/utils/supabase/server";
import { formatInr } from "@/lib/format";
import type { PushEvent } from "@/lib/push-client";
import type { Payment } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export type { PushEvent };

export type SerializedPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function vapidConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  if (pub.startsWith("your_") || priv.startsWith("your_")) return false;
  return true;
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
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? null;
  if (key && key.startsWith("your_")) return null;
  return key;
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
  payload: { title: string; body: string; url: string; tag: string },
  supabaseClient?: SupabaseClient
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0 };
  }

  const supabase = supabaseClient ?? (await createClient());
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
    tag: payload.tag,
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(
    targets.map(async (t) => {
      try {
        await sendWithRetry(
          {
            endpoint: t.endpoint,
            keys: { p256dh: t.p256dh, auth: t.auth },
          },
          body
        );
        sent += 1;
      } catch {
        failed += 1;
      }
    })
  );

  return { sent, failed };
}

function pushStatus(error: unknown): number {
  return error && typeof error === "object" && "statusCode" in error
    ? Number((error as { statusCode: number }).statusCode)
    : 0;
}

async function sendWithRetry(
  subscription: SerializedPushSubscription,
  body: string
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await webpush.sendNotification(subscription, body, {
        TTL: 60 * 60 * 24,
        urgency: "high",
        timeout: 7_000,
      });
      return;
    } catch (error) {
      lastError = error;
      const status = pushStatus(error);
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

/** Send an end-to-end confirmation to the signed-in user's selected device. */
export async function sendTestPush(endpoint: string): Promise<void> {
  if (!ensureVapid()) throw new Error("Push is not configured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Subscription not found");

  await webpush.sendNotification(
    {
      endpoint: data.endpoint,
      keys: { p256dh: data.p256dh, auth: data.auth },
    },
    JSON.stringify({
      title: "Payment alerts enabled",
      body: "This device is ready to receive Nawkiran payment updates.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: "/open",
      tag: "nawkiran-push-test",
    }),
    { TTL: 60, urgency: "high", timeout: 7_000 }
  );
}
