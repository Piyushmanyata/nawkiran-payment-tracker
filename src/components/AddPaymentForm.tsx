"use client";

import { useRef, useState, type FormEvent, type WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { usePaymentsLive } from "@/hooks/usePaymentsLive";
import { createPayment } from "@/lib/payments";
import { userMessageFromError } from "@/lib/errors";
import { canApprove } from "@/lib/roles";
import {
  errorBoxClass,
  fieldClass,
  hintClass,
  labelClass,
  successBoxClass,
} from "@/lib/ui";
import { LoadingButton } from "@/components/LoadingButton";

function blockNumberWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

export function AddPaymentForm() {
  const router = useRouter();
  const { profile } = useAuth();
  const { upsertPayment } = usePaymentsLive();
  const autoApprove = canApprove(profile?.role);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSuccess(null);
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

    setSubmitting(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const payment = await createPayment({
        party: partyClean,
        amount: Math.round(amountNum * 100) / 100,
        dueDate: dueDate || null,
        clientRequestId: requestId.current,
      });
      upsertPayment({
        ...payment,
        requester_name: profile?.full_name ?? payment.requester_name,
        approver_name:
          payment.approved_by === profile?.id
            ? (profile?.full_name ?? payment.approver_name)
            : payment.approver_name,
      });
      requestId.current = null;
      setSuccess(autoApprove ? "Added and approved" : "Sent for approval");
      setParty("");
      setAmount("");
      setDueDate("");
      window.setTimeout(() => router.push("/open"), 400);
    } catch (err) {
      setError(userMessageFromError(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className={labelClass}>Party / vendor *</span>
        <input
          required
          maxLength={150}
          value={party}
          onChange={(e) => setParty(e.target.value)}
          autoComplete="organization"
          placeholder="e.g. ABC Suppliers"
          className={fieldClass}
        />
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
            placeholder="0.00"
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
      {success ? <p className={successBoxClass}>{success}</p> : null}

      <LoadingButton
        type="submit"
        loading={submitting}
        loadingText="Submitting..."
      >
        {autoApprove ? "Add payment" : "Submit for approval"}
      </LoadingButton>
    </form>
  );
}
