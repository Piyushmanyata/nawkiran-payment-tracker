import { notifyPaymentEvent } from "@/app/actions/push";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { mapPayment } from "@/lib/map-payment";
import { firePaymentPush, pushEventForPayment } from "@/lib/push-client";
import type { Payment, PaymentMode, Profile, UserRole } from "@/types/database";

/** Only columns the UI uses — smaller payloads than select("*"). */
const PAYMENT_COLUMNS =
  "id, party, amount, due_date, purpose, status, requested_by, requested_at, approved_by, approved_at, denied_by, denied_at, denial_reason, paid_by, paid_at, payment_mode, payment_reference, updated_at, version, client_request_id";

type ViewedPayment = { status: string; requested_by?: string };

/**
 * Open = still needs someone to act.
 *
 * A denied request is open work for the person who raised it — they have to
 * correct and resubmit (or withdraw), so it must not sink into history where
 * it would be forgotten. Everyone else has already acted on it, so for them
 * it reads as history.
 */
export function isOpenPayment(
  payment: ViewedPayment,
  userId?: string | null
): boolean {
  if (payment.status === "pending" || payment.status === "approved") return true;
  return (
    payment.status === "denied" &&
    Boolean(userId) &&
    payment.requested_by === userId
  );
}

/** History = settled, or someone else's denial that is not yours to fix. */
export function isHistoryPayment(
  payment: ViewedPayment,
  userId?: string | null
): boolean {
  if (payment.status === "paid" || payment.status === "withdrawn") return true;
  return payment.status === "denied" && !isOpenPayment(payment, userId);
}

/** A denial the viewer personally has to resolve. Drives "needs your action". */
export function needsMyAction(
  payment: ViewedPayment,
  userId?: string | null
): boolean {
  return payment.status === "denied" && isOpenPayment(payment, userId);
}

type ProfileMeta = { name: string; role: UserRole };

function asRowArray(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data) as unknown;
      return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
  // Unexpected object shape — ignore, fall through to dual-select.
  return [];
}

function withNames(
  payment: Payment,
  row: Record<string, unknown>,
  byId?: Map<string, ProfileMeta>
): Payment {
  if (byId) {
    const requester = byId.get(payment.requested_by);
    return {
      ...payment,
      requester_name: requester?.name ?? null,
      requester_role: requester?.role ?? null,
      approver_name: payment.approved_by
        ? (byId.get(payment.approved_by)?.name ?? null)
        : null,
      denier_name: payment.denied_by
        ? (byId.get(payment.denied_by)?.name ?? null)
        : null,
      payer_name: payment.paid_by
        ? (byId.get(payment.paid_by)?.name ?? null)
        : null,
    };
  }
  return {
    ...payment,
    requester_name: (row.requester_name as string | null) ?? null,
    requester_role: (row.requester_role as UserRole | null) ?? null,
    approver_name: (row.approver_name as string | null) ?? null,
    denier_name: (row.denier_name as string | null) ?? null,
    payer_name: (row.payer_name as string | null) ?? null,
  };
}

/** Prefer session user id (local) over getUser() network round-trip. */
export async function fetchMyProfile(
  userId?: string | null
): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  let id = userId ?? null;
  if (!id) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    id = session?.user?.id ?? null;
  }
  if (!id) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as Profile;
}

/**
 * Prefer one-RTT RPC. Always falls back to dual select on any RPC failure
 * so the Open tab never hangs blank.
 */
export async function fetchPayments(): Promise<Payment[]> {
  const supabase = getSupabaseBrowserClient();

  try {
    const rpc = await supabase.rpc("list_payments_ui");
    if (!rpc.error && rpc.data != null) {
      const rows = asRowArray(rpc.data);
      // Empty array is valid; non-empty must map cleanly.
      if (rows.length === 0 || (rows[0] && rows[0].id != null)) {
        return rows.map((row) => {
          const payment = mapPayment(row);
          return withNames(payment, row);
        });
      }
    }
  } catch {
    // fall through
  }

  const paymentsRes = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .is("deleted_at", null)
    .order("requested_at", { ascending: false });

  if (paymentsRes.error) throw paymentsRes.error;
  const paymentRows = (paymentsRes.data ?? []) as Record<string, unknown>[];

  const userIdsSet = new Set<string>();
  for (const row of paymentRows) {
    if (typeof row.requested_by === "string" && row.requested_by) userIdsSet.add(row.requested_by);
    if (typeof row.approved_by === "string" && row.approved_by) userIdsSet.add(row.approved_by);
    if (typeof row.denied_by === "string" && row.denied_by) userIdsSet.add(row.denied_by);
    if (typeof row.paid_by === "string" && row.paid_by) userIdsSet.add(row.paid_by);
  }
  const userIds = Array.from(userIdsSet);

  let byId = new Map<string, ProfileMeta>();
  if (userIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .in("id", userIds);

    if (profilesRes.error) throw profilesRes.error;

    byId = new Map<string, ProfileMeta>(
      (profilesRes.data ?? []).map((p) => [
        p.id as string,
        { name: p.full_name as string, role: p.role as UserRole },
      ])
    );
  }

  return paymentRows.map((row) => {
    const payment = mapPayment(row);
    return withNames(payment, row, byId);
  });
}

/** Queue push off the critical path so mutations feel instant. */
function queuePush(
  paymentId: string,
  event: Parameters<typeof firePaymentPush>[2]
): void {
  void firePaymentPush(notifyPaymentEvent, paymentId, event);
}

export async function hasSimilarPendingPayment(input: {
  party: string;
  amount: number;
}): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("has_similar_pending_payment", {
    p_party: input.party,
    p_amount: input.amount,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function createPayment(input: {
  party: string;
  amount: number;
  dueDate?: string | null;
  clientRequestId: string;
}): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_payment", {
    p_party: input.party,
    p_amount: input.amount,
    p_client_request_id: input.clientRequestId,
    p_due_date: input.dueDate || null,
    p_purpose: null,
  });

  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  const event = pushEventForPayment(payment, "created");
  if (event) queuePush(payment.id, event);
  return payment;
}

export async function approvePayment(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("approve_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  queuePush(payment.id, "approved");
  return payment;
}

export async function denyPayment(
  paymentId: string,
  reason: string
): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("deny_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  queuePush(payment.id, "denied");
  return payment;
}

/** Mark approved payment paid with optional payment mode and reference (UTR). */
export async function markPaymentPaid(
  paymentId: string,
  paymentMode?: PaymentMode | string | null,
  paymentReference?: string | null
): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
    p_payment_mode: paymentMode || "NEFT",
    p_payment_reference: paymentReference || null,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  queuePush(payment.id, "paid");
  return payment;
}

/**
 * Requester drops their own denied request instead of resubmitting it.
 * The only way a denial leaves the requester's Open list without a payout.
 */
export async function withdrawPayment(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("withdraw_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return mapPayment(data as Record<string, unknown>);
}

/** Admin only — hides a settled payment while preserving its audit events. */
export async function adminDeletePayment(paymentId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("admin_delete_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
}

/** History hard-delete retention window (days). UI still groups by week. */
export const HISTORY_KEEP_DAYS = 30;

export async function purgeOldHistory(
  keepDays = HISTORY_KEEP_DAYS
): Promise<number> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("purge_old_payment_history", {
    p_keep_days: keepDays,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

const PURGE_FLAG = "nk_history_purge_at";
const PURGE_EVERY_MS = 12 * 60 * 60 * 1000;

export async function maybePurgeOldHistory(): Promise<number> {
  try {
    const last = Number(
      typeof localStorage !== "undefined"
        ? localStorage.getItem(PURGE_FLAG) || 0
        : 0
    );
    if (Date.now() - last < PURGE_EVERY_MS) return 0;
    const n = await purgeOldHistory(HISTORY_KEEP_DAYS);
    // Only stamp after success so a failed purge can retry next visit.
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PURGE_FLAG, String(Date.now()));
    }
    return n;
  } catch {
    return 0;
  }
}

export async function editUnpaidPayment(input: {
  paymentId: string;
  party: string;
  amount: number;
  dueDate?: string | null;
  priorStatus?: Payment["status"];
}): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("edit_unpaid_payment", {
    p_payment_id: input.paymentId,
    p_party: input.party,
    p_amount: input.amount,
    p_due_date: input.dueDate || null,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  if (input.priorStatus === "denied") {
    queuePush(payment.id, "pending");
  }
  return payment;
}
