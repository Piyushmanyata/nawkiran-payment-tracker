import type { UserRole } from "@/types/database";

/** Director (and admin) approve / deny pending requests. */
export function canApprove(role: UserRole | null | undefined): boolean {
  return role === "director" || role === "admin";
}

/** Employees process payouts; accounts/admin kept for older setups. */
export function canMarkPaid(role: UserRole | null | undefined): boolean {
  return role === "employee" || role === "accounts" || role === "admin";
}

/**
 * Staff may edit unpaid payments.
 * Employees/accounts may edit each others' — never director-requested ones.
 * Pass `payment` for the per-row guard; omit for a role-level capability check.
 */
export function canEditPayment(
  role: UserRole | null | undefined,
  payment?: { requester_role?: UserRole | null } | null
): boolean {
  if (!role) return false;
  if (role === "director" || role === "admin") return true;
  if (role !== "employee" && role !== "accounts") return false;
  // Employees can edit each other; director payments are director-only.
  if (payment?.requester_role === "director") return false;
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

/** Open to-do: initiator, director, or admin may edit. */
export function canEditTodo(
  role: UserRole | null | undefined,
  todo?: { created_by: string } | null,
  userId?: string | null
): boolean {
  if (!role) return false;
  if (role === "director" || role === "admin") return true;
  if (!todo || !userId) return false;
  return todo.created_by === userId;
}

/** Admin-only hard delete for to-dos. */
export function canDeleteTodo(role: UserRole | null | undefined): boolean {
  return role === "admin";
}
