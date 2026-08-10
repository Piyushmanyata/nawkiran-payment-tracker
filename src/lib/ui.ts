import type { PaymentStatus } from "@/types/database";

/** Shared form control styles — keep inputs consistent across pages. */
export const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export const labelClass = "mb-1 block text-sm font-semibold text-slate-700";

export const hintClass = "mt-1 block text-xs text-slate-500";

export const errorBoxClass =
  "rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700";

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function blockNumberWheel(e: React.WheelEvent<HTMLInputElement>) {
  (e.currentTarget as HTMLInputElement).blur();
}

export function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export type PaymentStatusUIConfig = {
  containerClass: string;
  badgeClass: string;
  badgeLabel: string;
  line1Class: string;
  step2IconClass: string;
  step2IconText: string;
};

/** Single source of truth for payment status colours — cards and drawer share it. */
export const PAYMENT_STATUS_UI: Record<PaymentStatus, PaymentStatusUIConfig> = {
  pending: {
    containerClass: "border-slate-200",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
    badgeLabel: "Pending Request",
    line1Class: "bg-amber-400",
    step2IconClass: "bg-amber-500 text-white",
    step2IconText: "2",
  },
  approved: {
    containerClass: "border-slate-200",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
    badgeLabel: "Approved Request",
    line1Class: "bg-emerald-500",
    step2IconClass: "bg-emerald-600 text-white",
    step2IconText: "✓",
  },
  denied: {
    containerClass: "border-rose-300 bg-rose-50/40",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
    badgeLabel: "Denied Request",
    line1Class: "bg-rose-400",
    step2IconClass: "bg-rose-500 text-white",
    step2IconText: "✕",
  },
  paid: {
    containerClass: "border-slate-200 bg-slate-50/20",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    badgeLabel: "Paid Request",
    line1Class: "bg-emerald-500",
    step2IconClass: "bg-emerald-600 text-white",
    step2IconText: "✓",
  },
  withdrawn: {
    containerClass: "border-slate-200 bg-slate-50/60",
    badgeClass: "bg-slate-100 text-slate-600 border-slate-300",
    badgeLabel: "Withdrawn Request",
    line1Class: "bg-slate-300",
    step2IconClass: "bg-slate-300 text-slate-600",
    step2IconText: "—",
  },
};


