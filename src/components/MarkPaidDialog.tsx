"use client";

import { formatInr } from "@/lib/format";
import { LoadingButton } from "@/components/LoadingButton";
import { Modal } from "@/components/Modal";

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
  return (
    <Modal
      open={open}
      titleId="paid-title"
      title="Mark as paid?"
      onClose={onCancel}
      disableClose={loading}
    >
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
    </Modal>
  );
}
