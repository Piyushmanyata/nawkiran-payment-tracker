"use client";

import { useState } from "react";
import { LoadingButton } from "@/components/LoadingButton";
import { PAYMENT_MODES, type PaymentMode } from "@/types/database";

export function MarkPaidDialog({
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (mode: PaymentMode, reference: string) => void;
}) {
  const [mode, setMode] = useState<PaymentMode>("NEFT");
  const [reference, setReference] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="paid-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="paid-title" className="text-lg font-bold text-slate-900">
          Mark as paid
        </h2>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Payment mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PaymentMode)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          >
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          UTR / reference
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={100}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton
            variant="secondary"
            onClick={() => {
              setReference("");
              setMode("NEFT");
              onCancel();
            }}
            disabled={loading}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            loading={loading}
            loadingText="Saving..."
            onClick={() => onConfirm(mode, reference.trim())}
          >
            Mark Paid
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
