import { removePushSubscription, savePushSubscription } from "@/lib/push";
import type { SerializedPushSubscription } from "@/lib/push";

type RotationPayload = {
  subscription?: SerializedPushSubscription;
  oldEndpoint?: string | null;
};

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response(null, { status: 403 });
  }

  let payload: RotationPayload;
  try {
    payload = (await request.json()) as RotationPayload;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = payload.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }

  try {
    await savePushSubscription(sub, request.headers.get("user-agent"));
    if (payload.oldEndpoint && payload.oldEndpoint !== sub.endpoint) {
      await removePushSubscription(payload.oldEndpoint);
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 401 });
  }
}
