import { notifyPaymentEvent } from "@/app/actions/push";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { mapPayment } from "@/lib/map-payment";
import { firePaymentPush, pushEventForPayment } from "@/lib/push-client";
import type { Payment, Profile } from "@/types/database";

/** Only columns the UI uses — smaller payloads than select("*"). */
const PAYMENT_COLUMNS =
  "id, party, amount, due_date, purpose, status, requested_by, requested_at, approved_by, approved_at, denied_by, denied_at, denial_reason, paid_by, paid_at, payment_mode, payment_reference, updated_at, version, client_request_id";

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
 * One query: payments + lifecycle actor names via FK embeds (one RTT).
 * Falls back to parallel queries if embed is unavailable.
 */
export async function fetchPayments(): Promise<Payment[]> {
  const supabase = getSupabaseBrowserClient();

  const embedded = await supabase
    .from("payments")
    .select(
      `${PAYMENT_COLUMNS}, requester:profiles!payments_requested_by_fkey(full_name), approver:profiles!payments_approved_by_fkey(full_name), denier:profiles!payments_denied_by_fkey(full_name), payer:profiles!payments_paid_by_fkey(full_name)`
    )
    .order("requested_at", { ascending: false });

  if (!embedded.error && embedded.data) {
    return embedded.data.map((row) => {
      const r = row as Record<string, unknown>;
      const payment = mapPayment(r);
      const requester = r.requester as { full_name?: string } | null;
      const approver = r.approver as { full_name?: string } | null;
      const denier = r.denier as { full_name?: string } | null;
      const payer = r.payer as { full_name?: string } | null;
      return {
        ...payment,
        requester_name: requester?.full_name ?? null,
        approver_name: approver?.full_name ?? null,
        denier_name: denier?.full_name ?? null,
        payer_name: payer?.full_name ?? null,
      };
    });
  }

  // Fallback: two parallel selects (older schemas / missing FK name)
  const [paymentsRes, profilesRes] = await Promise.all([
    supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .order("requested_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p.full_name as string])
  );

  return (paymentsRes.data ?? []).map((row) => {
    const payment = mapPayment(row as Record<string, unknown>);
    return {
      ...payment,
      requester_name: nameById.get(payment.requested_by) ?? null,
      approver_name: payment.approved_by
        ? (nameById.get(payment.approved_by) ?? null)
        : null,
      denier_name: payment.denied_by
        ? (nameById.get(payment.denied_by) ?? null)
        : null,
      payer_name: payment.paid_by ? (nameById.get(payment.paid_by) ?? null) : null,
    };
  });
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
  if (event) await firePaymentPush(notifyPaymentEvent, payment.id, event);
  return payment;
}

export async function approvePayment(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("approve_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  await firePaymentPush(notifyPaymentEvent, payment.id, "approved");
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
  await firePaymentPush(notifyPaymentEvent, payment.id, "denied");
  return payment;
}

/** Mark approved payment paid (no mode/UTR — DB defaults). */
export async function markPaymentPaid(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  await firePaymentPush(notifyPaymentEvent, payment.id, "paid");
  return payment;
}

/** Admin only — hides a paid/denied payment while preserving its audit events. */
export async function adminDeletePayment(paymentId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("admin_delete_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
}

/**
 * Edit an unpaid payment (pending / approved / denied).
 * Denied payments are resubmitted as pending.
 */
export async function editUnpaidPayment(input: {
  paymentId: string;
  party: string;
  amount: number;
  dueDate?: string | null;
  /** Prior status — used only for push routing after denied resubmit. */
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
    await firePaymentPush(notifyPaymentEvent, payment.id, "pending");
  }
  return payment;
}

