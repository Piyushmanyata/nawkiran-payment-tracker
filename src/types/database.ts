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

export type TodoStatus = "open" | "done";
export type TodoPriority = "normal" | "urgent";

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
  /** Joined role of requester - used to protect director-owned rows */
  requester_role?: UserRole | null;
  approver_name?: string | null;
  denier_name?: string | null;
  payer_name?: string | null;
}

export interface PaymentEvent {
  id: number;
  payment_id: string;
  action:
    | "created"
    | "approved"
    | "denied"
    | "paid"
    | "resubmitted"
    | "edited"
    | "admin_deleted";
  performed_by: string;
  old_status: PaymentStatus | null;
  new_status: PaymentStatus;
  note: string | null;
  created_at: string;
}

export interface TodoAssignee {
  id: string;
  full_name: string;
}

export interface Todo {
  id: string;
  title: string;
  priority: TodoPriority;
  due_date: string | null;
  status: TodoStatus;
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
  creator_name?: string | null;
  completer_name?: string | null;
  assignees: TodoAssignee[];
  /** Present only on create/update RPC responses */
  newly_assigned?: string[];
}

export interface EditPaymentInput {
  party: string;
  amount: number;
  dueDate: string | null;
}

