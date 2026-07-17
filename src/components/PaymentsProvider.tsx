"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchPayments } from "@/lib/payments";
import { subscribePayments } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import type { Payment } from "@/types/database";

interface PaymentsState {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  /** Patch one payment in place (optimistic + post-mutation). */
  upsertPayment: (payment: Payment) => void;
  /** Remove a payment locally (admin delete). */
  removePayment: (id: string) => void;
}

const PaymentsContext = createContext<PaymentsState | null>(null);

/**
 * Single app-wide payments cache + one Realtime channel.
 * Mount once under the authenticated shell so Open/History/Add share data
 * and tab switches are instant (no re-fetch).
 */
export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const hasLoaded = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const version = ++requestVersion.current;
    if (!opts?.silent && !hasLoaded.current) setLoading(true);
    try {
      const rows = await fetchPayments();
      if (version !== requestVersion.current) return;
      setPayments(rows);
      setError(null);
      hasLoaded.current = true;
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(userMessageFromError(err));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer initial load so the effect body is not a sync setState path (React 19).
    const t = window.setTimeout(() => void load(), 0);
    // Silent background refresh on realtime / online / visibility
    const unsubscribe = subscribePayments(() => {
      void load({ silent: true });
    });
    return () => {
      requestVersion.current += 1;
      window.clearTimeout(t);
      unsubscribe();
    };
  }, [load]);

  const upsertPayment = useCallback((payment: Payment) => {
    setPayments((prev) => {
      const i = prev.findIndex((p) => p.id === payment.id);
      if (i === -1) return [payment, ...prev];
      const next = prev.slice();
      next[i] = { ...prev[i], ...payment };
      return next;
    });
  }, []);

  const removePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      payments,
      loading,
      error,
      setError,
      reload: () => load({ silent: true }),
      upsertPayment,
      removePayment,
    }),
    [payments, loading, error, load, upsertPayment, removePayment]
  );

  return (
    <PaymentsContext.Provider value={value}>{children}</PaymentsContext.Provider>
  );
}

export function usePayments(): PaymentsState {
  const ctx = useContext(PaymentsContext);
  if (!ctx) {
    throw new Error("usePayments must be used within PaymentsProvider");
  }
  return ctx;
}
