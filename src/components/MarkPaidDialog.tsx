"use client";

import { useState } from "react";
import { formatInr } from "@/lib/format";
import { fieldClass, labelClass } from "@/lib/ui";
import { LoadingButton } from "@/components/LoadingButton";
import { Modal } from "@/components/Modal";
import type { PaymentActionTarget, PaymentMode } from "@/types/database";

const PAYMENT_MODES: PaymentMode[] = [
  "NEFT",
  "RTGS",
  "IMPS",
  "UPI",
  "Cheque",
  "Cash",
  "Other",
];

export function MarkPaidDialog({
  open,
  target,
  party,
  amount,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  target?: PaymentActionTarget | null;
  party?: string;
  amount?: number | string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (paymentMode: PaymentMode, reference?: string) => void;
}) {
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("NEFT");
  const [reference, setReference] = useState("");

  const displayParty = target?.party ?? party ?? "";
  const displayAmount = target?.amount ?? amount ?? 0;

  return (
    <Modal
      open={open}
      titleId="paid-title"
      title="Mark as paid?"
      onClose={onCancel}
      disableClose={loading}
    >
      <p className="mt-2 text-base text-slate-700">
        Confirm {formatInr(displayAmount)} for {displayParty} has been paid.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className={labelClass}>Payment mode</label>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            className={fieldClass}
          >
            {PAYMENT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>UTR / Reference (Optional)</label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. UTR12345678"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <LoadingButton variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </LoadingButton>
        <LoadingButton
          loading={loading}
          loadingText="Saving..."
          onClick={() => onConfirm(paymentMode, reference)}
        >
          Mark Paid
        </LoadingButton>
      </div>
    </Modal>
  );
}
