import { notifyPaymentEvent } from "@/app/actions/push";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { firePaymentPush, pushEventForPayment } from "@/lib/push-client";
import type { Payment, Profile } from "@/types/database";

/** Only columns the UI uses — smaller payloads than select("*"). */
const PAYMENT_COLUMNS =
  "id, party, amount, due_date, purpose, status, requested_by, requested_at, approved_by, approved_at, denied_by, denied_at, denial_reason, paid_by, paid_at, payment_mode, payment_reference, updated_at, version, client_request_id";

function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: String(row.id),
    party: String(row.party),
    amount: row.amount as number | string,
    due_date: (row.due_date as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    status: row.status as Payment["status"],
    requested_by: String(row.requested_by),
    requested_at: String(row.requested_at),
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    denied_by: (row.denied_by as string | null) ?? null,
    denied_at: (row.denied_at as string | null) ?? null,
    denial_reason: (row.denial_reason as string | null) ?? null,
    paid_by: (row.paid_by as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    payment_mode: (row.payment_mode as string | null) ?? null,
    payment_reference: (row.payment_reference as string | null) ?? null,
    updated_at: String(row.updated_at),
    version: Number(row.version ?? 1),
    client_request_id: String(row.client_request_id),
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
 * Load payments + requester names in parallel (one RTT instead of sequential).
 * Profiles table is small (team app); join client-side.
 */
export async function fetchPayments(): Promise<Payment[]> {
  const supabase = getSupabaseBrowserClient();

  const [paymentsRes, profilesRes] = await Promise.all([
    supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .order("requested_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);

  if (paymentsRes.error) throw paymentsRes.error;

  const nameById = new Map(
    (profilesRes.data ?? []).map((p) => [p.id as string, p.full_name as string])
  );

  return (paymentsRes.data ?? []).map((row) => {
    const payment = mapPayment(row as Record<string, unknown>);
    return {
      ...payment,
      requester_name: nameById.get(payment.requested_by) ?? null,
    };
  });
}

export async function createPayment(input: {
  party: string;
  amount: number;
  dueDate?: string | null;
  purpose?: string | null;
  clientRequestId: string;
}): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("create_payment", {
    p_party: input.party,
    p_amount: input.amount,
    p_client_request_id: input.clientRequestId,
    p_due_date: input.dueDate || null,
    p_purpose: input.purpose || null,
  });

  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  const event = pushEventForPayment(payment, "created");
  if (event) firePaymentPush(notifyPaymentEvent, payment.id, event);
  return payment;
}

export async function approvePayment(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("approve_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  firePaymentPush(notifyPaymentEvent, payment.id, "approved");
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
  firePaymentPush(notifyPaymentEvent, payment.id, "denied");
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
  firePaymentPush(notifyPaymentEvent, payment.id, "paid");
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

/** Edit a denied payment and resubmit it as pending. */
export async function correctDeniedPayment(input: {
  paymentId: string;
  party: string;
  amount: number;
  dueDate?: string | null;
  purpose?: string | null;
}): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("correct_denied_payment", {
    p_payment_id: input.paymentId,
    p_party: input.party,
    p_amount: input.amount,
    p_due_date: input.dueDate || null,
    p_purpose: input.purpose || null,
  });
  if (error) throw error;
  const payment = mapPayment(data as Record<string, unknown>);
  firePaymentPush(notifyPaymentEvent, payment.id, "pending");
  return payment;
}
