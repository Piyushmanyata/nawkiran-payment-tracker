"use client";

import { formatInr } from "@/lib/format";
import { LoadingButton } from "@/components/LoadingButton";
import { Modal } from "@/components/Modal";
import type { PaymentActionTarget } from "@/types/database";

export function ApproveDialog({
  open,
  target,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  target?: PaymentActionTarget | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      titleId="approve-title"
      title="Confirm approval"
      onClose={onCancel}
      disableClose={loading}
    >
      <p className="mt-2 text-base text-slate-700">
        Approve {formatInr(target?.amount ?? 0)} for {target?.party ?? ""}?
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <LoadingButton variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </LoadingButton>
        <LoadingButton loading={loading} loadingText="Saving..." onClick={onConfirm}>
          Approve
        </LoadingButton>
      </div>
    </Modal>
  );
}
