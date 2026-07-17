"use client";

import { AddPaymentForm } from "@/components/AddPaymentForm";
import { useAuth } from "@/components/AuthProvider";
import { canApprove } from "@/lib/roles";

export default function AddPage() {
  const { profile } = useAuth();
  const autoApprove = canApprove(profile?.role);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Add payment
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {autoApprove
            ? "Party and amount are required. Your request will be approved automatically."
            : "Party and amount are required. Due date and purpose are optional."}
        </p>
      </div>
      <AddPaymentForm />
    </div>
  );
}
