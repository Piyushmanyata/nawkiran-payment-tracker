import "server-only";
import webpush from "web-push";
import { createClient } from "@/utils/supabase/server";
import { formatInr } from "@/lib/format";
import type { PushEvent } from "@/lib/push-client";
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
    vapidSubject(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return true;
}

/** Apple rejects VAPID JWTs whose contact subject is missing or malformed. */
function vapidSubject(endpoint?: string): string {
  // APNs is stricter than FCM about the JWT subject; use the canonical HTTPS contact.
  if (endpoint && new URL(endpoint).hostname === "web.push.apple.com") {
    return "https://nawkiran-payment-tracker.vercel.app";
  }

  const configured = process.env.VAPID_SUBJECT?.trim();
  if (!configured) {
    return "https://nawkiran-payment-tracker.vercel.app";
  }

  const withoutMailtoBrackets = configured.replace(/^mailto:<([^<>]+)>$/i, "mailto:$1");
  if (
    /^https:\/\/[^\s<>]+$/i.test(withoutMailtoBrackets) ||
    /^mailto:[^\s<>@]+@[^\s<>@]+$/i.test(withoutMailtoBrackets)
  ) {
    return withoutMailtoBrackets;
  }

  throw new Error("VAPID_SUBJECT must be an https URL or mailto: address");
}

export function isPushConfigured(): boolean {
  return vapidConfigured();
}

/** Params always shown on payment push: party, amount, who initiated. */
export type PaymentPushParams = {
  party: string;
  amount: number | string;
  initiatedBy: string;
  denialReason?: string | null;
};

/**
 * Build title/body for a payment lifecycle event.
 * Body always includes party · amount · by initiator.
 *
 * Workflow:
 *   pending  → director approval
 *   approved → employees can pay
 *   denied   → employees correct
 *   paid     → director informed
 */
export function buildPushPayload(
  event: PushEvent,
  payment: PaymentPushParams
): { title: string; body: string; url: string } {
  const amount = formatInr(payment.amount);
  const by = payment.initiatedBy.trim() || "Unknown";
  const core = `${payment.party} · ${amount} · by ${by}`;

  switch (event) {
    case "pending":
      return {
        title: "Approval needed",
        body: core,
        url: "/open",
      };
    case "approved":
      // Director/admin initiate (auto-approve) or director approval of a request.
      return {
        title: "New payment to pay",
        body: core,
        url: "/open",
      };
    case "denied":
      return {
        title: "Payment denied — correct it",
        body: payment.denialReason
          ? `${core} — ${payment.denialReason}`
          : core,
        url: "/open",
      };
    case "paid":
      return {
        title: "Marked paid",
        body: core,
        url: "/history",
      };
    default:
      return {
        title: "Nawkiran Payments",
        body: core,
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
        const outcome = await sendWithRetry(
          {
            endpoint: t.endpoint,
            keys: { p256dh: t.p256dh, auth: t.auth },
          },
          body
        );
        if (outcome === "ok") {
          sent += 1;
          return;
        }
        failed += 1;
        if (outcome === "gone") {
          // Drop dead endpoints so later payments skip them.
          try {
            await supabase.rpc("purge_push_endpoint", {
              p_endpoint: t.endpoint,
            });
          } catch {
            /* best-effort cleanup */
          }
        }
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

/** ok = delivered, gone = 404/410 (purge), fail = other terminal error */
async function sendWithRetry(
  subscription: SerializedPushSubscription,
  body: string
): Promise<"ok" | "gone" | "fail"> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await webpush.sendNotification(subscription, body, {
        TTL: 60 * 60 * 24,
        urgency: "high",
        timeout: 7_000,
        vapidDetails: {
          subject: vapidSubject(subscription.endpoint),
          publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
      });
      return "ok";
    } catch (error) {
      lastStatus = pushStatus(error);
      if (lastStatus === 404 || lastStatus === 410) return "gone";
      const transient = lastStatus === 0 || lastStatus === 429 || lastStatus >= 500;
      if (!transient || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  return "fail";
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
    {
      TTL: 60,
      urgency: "high",
      timeout: 7_000,
      vapidDetails: {
        subject: vapidSubject(data.endpoint),
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        privateKey: process.env.VAPID_PRIVATE_KEY!,
      },
    }
  );
}
