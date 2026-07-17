import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Payment, Profile } from "@/types/database";

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

export async function fetchMyProfile(): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as Profile;
}

export async function fetchPayments(): Promise<Payment[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("requested_at", { ascending: false });

  if (error) throw error;

  const payments = (data ?? []).map((row) =>
    mapPayment(row as Record<string, unknown>)
  );

  // Attach requester names when profiles are readable
  const ids = [...new Set(payments.map((p) => p.requested_by))];
  if (ids.length === 0) return payments;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, p.full_name as string])
  );

  return payments.map((p) => ({
    ...p,
    requester_name: nameById.get(p.requested_by) ?? null,
  }));
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
  return mapPayment(data as Record<string, unknown>);
}

export async function approvePayment(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("approve_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return mapPayment(data as Record<string, unknown>);
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
  return mapPayment(data as Record<string, unknown>);
}

/** Mark approved payment paid (no mode/UTR — DB defaults). */
export async function markPaymentPaid(paymentId: string): Promise<Payment> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("mark_payment_paid", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  return mapPayment(data as Record<string, unknown>);
}

/** Admin only — removes a paid/denied history payment and its events. */
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
  return mapPayment(data as Record<string, unknown>);
}
