"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 active:bg-slate-300 disabled:bg-slate-50 disabled:text-slate-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300",
  ghost:
    "bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200 disabled:text-slate-400",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: Variant;
  children: ReactNode;
}

export function LoadingButton({
  loading = false,
  loadingText = "Saving...",
  variant = "primary",
  children,
  className = "",
  disabled,
  type = "button",
  ...rest
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-base font-semibold transition disabled:cursor-not-allowed ${variantClass[variant]} ${className}`}
      {...rest}
    >
      {loading ? loadingText : children}
    </button>
  );
}
