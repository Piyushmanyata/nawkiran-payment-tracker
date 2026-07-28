"use server";

import { after } from "next/server";
import {
  buildPushPayload,
  buildTodoUpdateReqPayload,
  buildTodoUpdateReplyPayload,
  isPushConfigured,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  sendPaymentPush,
  sendTodoPush,
  sendTodoOverdueDigestPush,
  sendTodoUpdateRequestPush,
  sendTodoUpdateReplyPush,
  type PushEvent,
  type SerializedPushSubscription,
} from "@/lib/push";
import { createClient } from "@/utils/supabase/server";

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

export async function sendTestNotification(
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!endpoint) return { success: false, error: "Missing endpoint" };
    await sendTestPush(endpoint);
    return { success: true };
  } catch (err) {
    console.error("sendTestNotification", err);
    await removePushSubscription(endpoint).catch((cleanupError) => {
      console.error("sendTestNotification cleanup", cleanupError);
    });
    return {
      success: false,
      error:
        err instanceof Error && /VAPID_SUBJECT/i.test(err.message)
          ? err.message
          : "Test notification failed",
    };
  }
}

/**
 * Fire-and-forget: notify role targets after a payment lifecycle change.
 * Safe to ignore failures - payment already succeeded.
 */
export async function notifyPaymentEvent(
  paymentId: string,
  event: PushEvent
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  try {
    if (!isPushConfigured()) {
      return { success: true, queued: false };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "Not signed in" };
    }

    const { data, error } = await supabase.rpc("payment_push_context", {
      p_payment_id: paymentId,
      p_event: event,
    });

    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          party: string;
          amount: number | string;
          denial_reason: string | null;
          version: number | null;
          actor_name: string | null;
        }
      | null
      | undefined;

    if (!row?.party) {
      return { success: false, error: "Payment not found" };
    }

    const version = Number(row.version ?? 1);
    const payload = buildPushPayload(event, {
      party: row.party,
      amount: row.amount,
      actorName: row.actor_name?.trim() || "Someone",
      denialReason: row.denial_reason,
    });

    const tag = `nk:${payload.tagPrefix}:${paymentId}:v${version}`;

    after(async () => {
      try {
        const result = await sendPaymentPush(
          paymentId,
          event,
          {
            title: payload.title,
            body: payload.body,
            url: payload.url,
            tag,
          },
          supabase
        );
        if (result.failed > 0) {
          console.error("notifyPaymentEvent delivery failures", {
            event,
            failed: result.failed,
            sent: result.sent,
          });
        }
      } catch (deliveryError) {
        console.error("notifyPaymentEvent delivery", deliveryError);
      }
    });
    return { success: true, queued: true };
  } catch (err) {
    console.error("notifyPaymentEvent", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}

/** Notify newly assigned people after create/update to-do. */
export async function notifyTodoAssigned(
  todoId: string,
  title: string,
  userIds: string[]
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  try {
    if (!isPushConfigured()) return { success: true, queued: false };
    if (!todoId) return { success: false, error: "Missing todo" };
    const ids = userIds.filter(Boolean);
    if (ids.length === 0) return { success: true, queued: false };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in" };

    const cleanTitle = title.trim() || "To-do";
    after(async () => {
      try {
        // RPC only returns targets for users who are assignees of this todo.
        await sendTodoPush(
          todoId,
          ids,
          {
            title: "To-do assigned to you",
            body: cleanTitle,
            url: "/todo",
            tag: `nk:todo:${todoId}`,
          },
          supabase
        );
      } catch (deliveryError) {
        console.error("notifyTodoAssigned delivery", deliveryError);
      }
    });
    return { success: true, queued: true };
  } catch (err) {
    console.error("notifyTodoAssigned", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}

/**
 * Overdue digest: push to ALL responsible users (assignees, or initiator if unassigned).
 * Each user receives only the to-dos they are personally responsible for.
 * Triggered client-side on page load; the signed-in user's own count is returned
 * (for the localStorage rate-limit guard), but all team members are notified.
 */
export async function notifyMyOverdueTodos(): Promise<{
  success: boolean;
  queued?: boolean;
  count?: number;
  error?: string;
}> {
  try {
    if (!isPushConfigured()) return { success: true, queued: false, count: 0 };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in" };

    // Fetch overdue titles for all responsible users across the team.
    const { data, error } = await supabase.rpc("list_overdue_todo_push_targets");
    if (error) throw error;

    const userTitles = (Array.isArray(data) ? data : []) as Array<{
      user_id: string;
      titles: string[];
    }>;
    if (userTitles.length === 0) return { success: true, queued: false, count: 0 };

    // Return the count for the current user so the client-side rate-limit guard works.
    const myEntry = userTitles.find((u) => u.user_id === user.id);
    const myCount = myEntry?.titles.length ?? 0;

    after(async () => {
      try {
        await sendTodoOverdueDigestPush(userTitles, supabase);
      } catch (deliveryError) {
        console.error("notifyMyOverdueTodos delivery", deliveryError);
      }
    });
    return { success: true, queued: true, count: myCount };
  } catch (err) {
    console.error("notifyMyOverdueTodos", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}

export async function notifyTodoUpdateRequest(
  todoId: string,
  todoTitle: string,
  message?: string
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  try {
    if (!isPushConfigured()) return { success: true, queued: false };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const actorId = user.id;
    const actorName = profile?.full_name || "A team member";
    const payload = buildTodoUpdateReqPayload({
      todoId,
      todoTitle,
      actorName,
      message,
    });

    after(async () => {
      try {
        await sendTodoUpdateRequestPush(todoId, actorId, payload, supabase);
      } catch (deliveryError) {
        console.error("notifyTodoUpdateRequest delivery error", deliveryError);
      }
    });

    return { success: true, queued: true };
  } catch (err) {
    console.error("notifyTodoUpdateRequest", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}

export async function notifyTodoUpdateReply(
  todoId: string,
  todoTitle: string,
  targetUserIds: string[],
  replyMessage: string
): Promise<{ success: boolean; queued?: boolean; error?: string }> {
  try {
    if (!isPushConfigured() || !targetUserIds.length) {
      return { success: true, queued: false };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not signed in" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const actorId = user.id;
    const actorName = profile?.full_name || "A team member";
    const payload = buildTodoUpdateReplyPayload({
      todoId,
      todoTitle,
      actorName,
      message: replyMessage,
    });

    after(async () => {
      try {
        await sendTodoUpdateReplyPush(
          todoId,
          targetUserIds,
          actorId,
          payload,
          supabase
        );
      } catch (deliveryError) {
        console.error("notifyTodoUpdateReply delivery error", deliveryError);
      }
    });

    return { success: true, queued: true };
  } catch (err) {
    console.error("notifyTodoUpdateReply", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Notify failed",
    };
  }
}
