"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createPayment } from "@/lib/payments";
import { userMessageFromError } from "@/lib/errors";
import { canApprove } from "@/lib/roles";
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError(null);
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
      await createPayment({
        party: partyClean,
        amount: Math.round(amountNum * 100) / 100,
        dueDate: dueDate || null,
        purpose: purpose.trim() || null,
        clientRequestId: crypto.randomUUID(),
      });
      setSuccess(
        autoApprove
          ? "Added and approved"
          : "Sent for approval"
      );
      setParty("");
      setAmount("");
      setDueDate("");
      setPurpose("");
      setTimeout(() => router.push("/open"), 600);
    } catch (err) {
      setError(userMessageFromError(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Party / vendor *
        </span>
        <input
          required
          maxLength={150}
          value={party}
          onChange={(e) => setParty(e.target.value)}
          autoComplete="organization"
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Amount *
        </span>
        <input
          required
          inputMode="decimal"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Due date
        </span>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <span className="mt-1 block text-xs text-slate-500">Optional</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-700">
          Purpose / note
        </span>
        <textarea
          maxLength={500}
          rows={3}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <span className="mt-1 block text-xs text-slate-500">Optional</span>
      </label>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          {success}
        </p>
      ) : null}

      <LoadingButton
        type="submit"
        loading={submitting}
        loadingText="Submitting..."
      >
        Submit
      </LoadingButton>
    </form>
  );
}
