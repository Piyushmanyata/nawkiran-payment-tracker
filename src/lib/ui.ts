/** Shared form control styles — keep inputs consistent across pages. */
export const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export const labelClass = "mb-1 block text-sm font-semibold text-slate-700";

export const hintClass = "mt-1 block text-xs text-slate-500";

export const errorBoxClass =
  "rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700";

export const successBoxClass =
  "rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800";

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
