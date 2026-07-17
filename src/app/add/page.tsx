"use client";

import { AddPaymentForm } from "@/components/AddPaymentForm";

export default function AddPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Add payment</h1>
      <p className="text-sm text-slate-600">
        Only party and amount are required. Due date and purpose are optional.
      </p>
      <AddPaymentForm />
    </div>
  );
}
