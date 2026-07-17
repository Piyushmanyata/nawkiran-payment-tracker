"use client";

import { formatInr } from "@/lib/format";
import { LoadingButton } from "@/components/LoadingButton";

export function MarkPaidDialog({
  open,
  party,
  amount,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  party: string;
  amount: number | string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
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
          Mark as paid?
        </h2>
        <p className="mt-2 text-base text-slate-700">
          Confirm {formatInr(amount)} for {party} has been paid.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </LoadingButton>
          <LoadingButton loading={loading} loadingText="Saving..." onClick={onConfirm}>
            Mark Paid
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
