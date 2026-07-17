"use client";

import { useState } from "react";
import { LoadingButton } from "@/components/LoadingButton";

export function DenyDialog({
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  if (!open) return null;

  const trimmed = reason.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deny-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="deny-title" className="text-lg font-bold text-slate-900">
          Why are you denying this payment?
        </h2>
        <label className="mt-4 block">
          <span className="sr-only">Denial reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Reason"
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton
            variant="secondary"
            onClick={() => {
              setReason("");
              onCancel();
            }}
            disabled={loading}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            variant="danger"
            loading={loading}
            loadingText="Saving..."
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            Deny
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
