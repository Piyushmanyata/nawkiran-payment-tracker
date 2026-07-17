"use client";

import { useState } from "react";
import { LoadingButton } from "@/components/LoadingButton";
import { Modal } from "@/components/Modal";
import { fieldClass } from "@/lib/ui";

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
  const trimmed = reason.trim();

  function close() {
    setReason("");
    onCancel();
  }

  return (
    <Modal
      open={open}
      titleId="deny-title"
      title="Why are you denying this payment?"
      onClose={close}
      disableClose={loading}
    >
      <label className="mt-4 block">
        <span className="sr-only">Denial reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Reason"
          autoFocus={open}
          className={fieldClass}
        />
      </label>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <LoadingButton variant="secondary" onClick={close} disabled={loading}>
          Cancel
        </LoadingButton>
        <LoadingButton
          variant="danger"
          loading={loading}
          loadingText="Saving..."
          disabled={!trimmed}
          onClick={() => {
            const r = trimmed;
            setReason("");
            onConfirm(r);
          }}
        >
          Deny
        </LoadingButton>
      </div>
    </Modal>
  );
}
