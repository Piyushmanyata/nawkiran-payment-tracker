export type UserRole = "employee" | "director" | "accounts" | "admin";

export type PaymentStatus = "pending" | "approved" | "denied" | "paid";

export type PaymentMode =
  | "NEFT"
  | "RTGS"
  | "IMPS"
  | "UPI"
  | "Cheque"
  | "Cash"
  | "Other";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  party: string;
  amount: number | string;
  due_date: string | null;
  purpose: string | null;
  status: PaymentStatus;
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  denied_by: string | null;
  denied_at: string | null;
  denial_reason: string | null;
  paid_by: string | null;
  paid_at: string | null;
  payment_mode: PaymentMode | string | null;
  payment_reference: string | null;
  updated_at: string;
  version: number;
  client_request_id: string;
  /** Joined display name when available */
  requester_name?: string | null;
}

export interface PaymentEvent {
  id: number;
  payment_id: string;
  action: "created" | "approved" | "denied" | "paid";
  performed_by: string;
  old_status: PaymentStatus | null;
  new_status: PaymentStatus;
  note: string | null;
  created_at: string;
}

