"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
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

export function AddPaymentForm() {
  const router = useRouter();
  const { profile } = useAuth();
  const autoApprove = canApprove(profile?.role);
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [purpose, setPurpose] = useState("");
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
      await createPayment({
        party: partyClean,
        amount: Math.round(amountNum * 100) / 100,
        dueDate: dueDate || null,
        purpose: purpose.trim() || null,
        clientRequestId: requestId.current,
      });
      requestId.current = null;
      setSuccess(autoApprove ? "Added and approved" : "Sent for approval");
      setParty("");
      setAmount("");
      setDueDate("");
      setPurpose("");
      window.setTimeout(() => router.push("/open"), 600);
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

      <label className="block">
        <span className={labelClass}>Purpose / note</span>
        <textarea
          maxLength={500}
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="What is this payment for?"
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
