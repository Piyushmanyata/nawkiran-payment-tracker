import type { Payment } from "@/types/database";

/** Map a payments row (RPC or table) to the app Payment shape. */
export function mapPayment(row: Record<string, unknown>): Payment {
  // Some RPC clients wrap a single composite row in an array.
  const r = (
    Array.isArray(row) ? (row[0] as Record<string, unknown> | undefined) : row
  ) as Record<string, unknown>;
  if (!r?.id) {
    throw new Error("Invalid payment row");
  }

  return {
    id: String(r.id),
    party: String(r.party),
    amount: r.amount as number | string,
    due_date: (r.due_date as string | null) ?? null,
    purpose: (r.purpose as string | null) ?? null,
    status: r.status as Payment["status"],
    requested_by: String(r.requested_by),
    requested_at: String(r.requested_at),
    approved_by: (r.approved_by as string | null) ?? null,
    approved_at: (r.approved_at as string | null) ?? null,
    denied_by: (r.denied_by as string | null) ?? null,
    denied_at: (r.denied_at as string | null) ?? null,
    denial_reason: (r.denial_reason as string | null) ?? null,
    paid_by: (r.paid_by as string | null) ?? null,
    paid_at: (r.paid_at as string | null) ?? null,
    payment_mode: (r.payment_mode as string | null) ?? null,
    payment_reference: (r.payment_reference as string | null) ?? null,
    updated_at: String(r.updated_at),
    version: Number(r.version ?? 1),
    client_request_id: String(r.client_request_id),
  };
}
