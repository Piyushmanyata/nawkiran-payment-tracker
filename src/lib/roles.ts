import type { UserRole } from "@/types/database";

/** Director (and admin) approve / deny pending requests. */
export function canApprove(role: UserRole | null | undefined): boolean {
  return role === "director" || role === "admin";
}

/** Employees process payouts; accounts/admin kept for older setups. */
export function canMarkPaid(role: UserRole | null | undefined): boolean {
  return role === "employee" || role === "accounts" || role === "admin";
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
