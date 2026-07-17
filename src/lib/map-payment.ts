import type { Payment } from "@/types/database";

/** Map a payments row (RPC or table) to the app Payment shape. */
export function mapPayment(row: Record<string, unknown>): Payment {
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
