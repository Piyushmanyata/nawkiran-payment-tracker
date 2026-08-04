export type UserRole =
  | "employee"
  | "director"
  | "accounts"
  | "admin"
  | "supervisor";

/** Plant / payroll company a Worker or Supervisor belongs to. */
export type Company = "NKPL" | "APTUS";

/**
 * `denied` is not a terminal state: the requester must correct and resubmit,
 * or withdraw. Only `paid` and `withdrawn` are settled.
 */
export type PaymentStatus =
  | "pending"
  | "approved"
  | "denied"
  | "paid"
  | "withdrawn";

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
  /** Required when role is supervisor; otherwise optional. */
  company: Company | null;
  active: boolean;
  created_at: string;
}

/** Day Shift or Night Shift — not A/B. */
export type Shift = "day" | "night";

/** Exception kinds only — presence is never recorded. */
export type AttendanceKind = "absent" | "weekly_off" | "lent_out";

export type AbsenceReason =
  | "sick"
  | "family"
  | "village"
  | "festival"
  | "no_information"
  | "other";

export interface Worker {
  id: string;
  company: Company;
  full_name: string;
  designation: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AttendanceDay {
  id: string;
  company: Company;
  work_date: string;
  shift: Shift;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceEntry {
  id: string;
  attendance_day_id: string;
  worker_id: string;
  kind: AttendanceKind;
  informed: boolean | null;
  reason: AbsenceReason | null;
  note: string | null;
  lent_to_company: Company | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
  /** Joined for summary/export when available */
  worker_name?: string | null;
  worker_designation?: string | null;
  recorder_name?: string | null;
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
    | "withdrawn"
    | "admin_deleted"
    | "deleted";
  performed_by: string;
  old_status: PaymentStatus | null;
  new_status: PaymentStatus;
  note: string | null;
  created_at: string;
}

export type TodoThreadType = "request" | "reply";

export interface TodoThread {
  id: string;
  todo_id: string;
  author_id: string;
  author_name: string;
  content: string;
  type: TodoThreadType;
  parent_id: string | null;
  created_at: string;
}

export interface TodoAssignee {
  id: string;
  full_name: string;
}

export type RecurrenceType =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom_weekly"
  | "custom_monthly";

export interface RecurrenceRule {
  type: RecurrenceType;
  days_of_week?: number[];
  day_of_month?: number;
}

export interface Todo {
  id: string;
  title: string;
  priority: TodoPriority;
  due_date: string | null;
  status: TodoStatus;
  recurrence_rule?: RecurrenceRule | null;
  created_by: string;
  created_at: string;
  completed_by: string | null;
  completed_at: string | null;
  creator_name?: string | null;
  completer_name?: string | null;
  assignees: TodoAssignee[];
  threads?: TodoThread[];
  /** Present only on create/update RPC responses */
  newly_assigned?: string[];
}

export interface CreateTodoInput {
  title: string;
  dueDate?: string | null;
  priority?: TodoPriority;
  assigneeIds?: string[];
  recurrenceRule?: RecurrenceRule | null;
}

export interface UpdateTodoInput extends CreateTodoInput {
  todoId: string;
}

export interface EditPaymentInput {
  party: string;
  amount: number;
  dueDate: string | null;
}

export interface PaymentActionTarget {
  party: string;
  amount: number | string;
}


