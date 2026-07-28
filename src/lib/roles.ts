import type { RecurrenceRule, UserRole } from "@/types/database";

/** Settled for good — no further edits, approvals or payouts. */
function isSettledPayment(status: string | undefined): boolean {
  return status === "paid" || status === "withdrawn";
}

/** Director (and admin) approve / deny pending requests. */
export function canApprove(role: UserRole | null | undefined): boolean {
  return role === "director" || role === "admin";
}

/** Employees process payouts; accounts/admin kept for older setups. */
export function canMarkPaid(role: UserRole | null | undefined): boolean {
  return role === "employee" || role === "accounts" || role === "admin";
}

/**
 * Who may edit which unpaid Payment Request.
 * Employee/accounts: own pending|denied only (not approved, not peers).
 * Director/admin: any unpaid. Paid never.
 * Pass `payment` + `userId` for the per-row guard; omit payment for role-level capability.
 */
export function canEditPayment(
  role: UserRole | null | undefined,
  payment?: {
    status?: string;
    requested_by?: string;
    requester_role?: UserRole | null;
  } | null,
  userId?: string | null
): boolean {
  if (!role) return false;
  if (role === "director" || role === "admin") {
    if (!payment) return true;
    return !isSettledPayment(payment.status);
  }
  if (role !== "employee" && role !== "accounts") return false;
  if (!payment) return true;
  if (payment.status === "approved" || isSettledPayment(payment.status)) return false;
  if (payment.status !== "pending" && payment.status !== "denied") return false;
  if (!userId || payment.requested_by !== userId) return false;
  return true;
}

/** Anyone with a staff role may add a payment request. */
export function canCreatePayment(role: UserRole | null | undefined): boolean {
  return (
    role === "employee" ||
    role === "director" ||
    role === "accounts" ||
    role === "admin"
  );
}

/** Only admin can permanently remove paid/denied history rows. */
export function canDeleteHistory(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

function isRecurringRule(rule?: RecurrenceRule | null): boolean {
  return Boolean(rule && rule.type && rule.type !== "none");
}

function todayLocalIso(refDate?: Date): string {
  const d = refDate ?? new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

/** Open to-do: creator or admin for recurring; creator, director, or admin for non-recurring. */
export function canEditTodo(
  role: UserRole | null | undefined,
  todo?: { created_by: string; recurrence_rule?: RecurrenceRule | null } | null,
  userId?: string | null
): boolean {
  if (!role || !todo) return false;
  if (role === "admin") return true;
  const isCreator = Boolean(userId && todo.created_by === userId);

  if (isRecurringRule(todo.recurrence_rule)) {
    return isCreator;
  }

  if (role === "director") return true;
  return isCreator;
}

/** Recurring to-dos cannot be marked complete until their due date arrives. */
export function canCompleteTodo(
  todo: { status: string; due_date?: string | null; recurrence_rule?: RecurrenceRule | null },
  refDate?: Date
): boolean {
  if (todo.status !== "open") return false;
  if (isRecurringRule(todo.recurrence_rule) && todo.due_date) {
    const today = todayLocalIso(refDate);
    if (todo.due_date > today) return false;
  }
  return true;
}

/** Admin-only hard delete for to-dos. */
export function canDeleteTodo(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

/** Computed action availability for payment cards and detail view. */
export function getPaymentActions(
  payment: {
    status: string;
    requested_by?: string;
    requester_role?: UserRole | null;
  },
  role: UserRole | null,
  handlers: {
    onApprove?: unknown;
    onDeny?: unknown;
    onMarkPaid?: unknown;
    onEdit?: unknown;
    onWithdraw?: unknown;
    onDelete?: unknown;
  },
  userId?: string | null
) {
  const showApprove =
    payment.status === "pending" &&
    canApprove(role) &&
    Boolean(handlers.onApprove && handlers.onDeny);

  const showMarkPaid =
    payment.status === "approved" &&
    canMarkPaid(role) &&
    Boolean(handlers.onMarkPaid);

  const unpaid =
    payment.status === "pending" ||
    payment.status === "approved" ||
    payment.status === "denied";

  const showEdit =
    unpaid &&
    canEditPayment(role, payment, userId) &&
    Boolean(handlers.onEdit);

  // Only the requester retires their own denial, and only by giving up on it.
  const showWithdraw =
    payment.status === "denied" &&
    Boolean(userId) &&
    payment.requested_by === userId &&
    Boolean(handlers.onWithdraw);

  const showDelete =
    (payment.status === "paid" ||
      payment.status === "denied" ||
      payment.status === "withdrawn") &&
    canDeleteHistory(role) &&
    Boolean(handlers.onDelete);

  return { showApprove, showMarkPaid, showEdit, showWithdraw, showDelete };
}

