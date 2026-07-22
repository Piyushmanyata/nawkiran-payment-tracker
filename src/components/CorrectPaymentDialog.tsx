"use client";

import { useMemo, useState, type FormEvent, type WheelEvent } from "react";
import type { Payment } from "@/types/database";
import { LoadingButton } from "@/components/LoadingButton";
import { Modal } from "@/components/Modal";
import { PartyTagBadges } from "@/components/PartyTagBadges";
import { detectPartyTags } from "@/lib/party-tag";
import {
  errorBoxClass,
  fieldClass,
  hintClass,
  labelClass,
} from "@/lib/ui";

/** Stop mouse-wheel from changing focused number inputs. */
function blockNumberWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function CorrectPaymentDialog({
  open,
  payment,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  payment: Payment | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (input: {
    party: string;
    amount: number;
    dueDate: string | null;
  }) => void;
}) {
  if (!open || !payment) return null;

  return (
    <EditForm
      key={payment.id + ":" + (payment.updated_at ?? "")}
      payment={payment}
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function EditForm({
  payment,
  loading,
  onCancel,
  onConfirm,
}: {
  payment: Payment;
  loading: boolean;
  onCancel: () => void;
  onConfirm: (input: {
    party: string;
    amount: number;
    dueDate: string | null;
  }) => void;
}) {
  const denied = payment.status === "denied";
  const [party, setParty] = useState(payment.party);
  const [amount, setAmount] = useState(String(payment.amount));
  const [dueDate, setDueDate] = useState(payment.due_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const liveTags = useMemo(() => detectPartyTags(party), [party]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    const partyClean = party.trim();
    const amountNum = Number(amount);
    if (!partyClean) {
      setError("Please enter a party or vendor name.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Please enter an amount greater than zero.");
      return;
    }

    setError(null);
    onConfirm({
      party: partyClean,
      amount: Math.round(amountNum * 100) / 100,
      dueDate: dueDate || null,
    });
  }

  return (
    <Modal
      open
      titleId="edit-payment-title"
      title={denied ? "Correct & resubmit" : "Edit payment"}
      onClose={onCancel}
      disableClose={loading}
    >
      {denied && payment.denial_reason ? (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-semibold">Denied — please fix and resubmit</p>
          <p className="mt-1">{payment.denial_reason}</p>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          {denied
            ? "Update the details below and resubmit for approval."
            : "Update details. Changes are allowed until the payment is marked paid."}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className={labelClass}>Party / vendor *</span>
          <input
            required
            maxLength={150}
            value={party}
            onChange={(e) => setParty(e.target.value)}
            className={fieldClass}
          />
          {liveTags.length > 0 ? (
            <div className="mt-1.5">
              <PartyTagBadges tags={liveTags} />
            </div>
          ) : (
            <span className={hintClass}>Type aptus/APTUS or nkpl to auto-tag</span>
          )}
        </label>

        <label className="block">
          <span className={labelClass}>Amount *</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-400">
              ₹
            </span>
            <input
              required
              inputMode="decimal"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onWheel={blockNumberWheel}
              className={`${fieldClass} pl-8`}
            />
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={fieldClass}
          />
          <span className={hintClass}>Optional</span>
        </label>

        {error ? <p className={errorBoxClass}>{error}</p> : null}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <LoadingButton
            variant="secondary"
            type="button"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </LoadingButton>
          <LoadingButton
            type="submit"
            loading={loading}
            loadingText="Saving..."
          >
            {denied ? "Resubmit" : "Save"}
          </LoadingButton>
        </div>
      </form>
    </Modal>
  );
}

