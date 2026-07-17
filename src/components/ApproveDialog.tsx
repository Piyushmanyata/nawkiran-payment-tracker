"use client";

import { formatInr } from "@/lib/format";
import { LoadingButton } from "@/components/LoadingButton";

export function ApproveDialog({
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
        aria-labelledby="approve-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="approve-title" className="text-lg font-bold text-slate-900">
          Confirm approval
        </h2>
        <p className="mt-2 text-base text-slate-700">
          Approve {formatInr(amount)} for {party}?
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <LoadingButton variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </LoadingButton>
          <LoadingButton loading={loading} loadingText="Saving..." onClick={onConfirm}>
            Approve
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
