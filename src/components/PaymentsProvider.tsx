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
import { mapPayment } from "@/lib/map-payment";
import { subscribePayments } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import type { Payment } from "@/types/database";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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
  /** Skip echo refetch right after local optimistic mutation. */
  const suppressUntil = useRef(0);

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

  const upsertPayment = useCallback((payment: Payment) => {
    suppressUntil.current = Date.now() + 900;
    setPayments((prev) => {
      const i = prev.findIndex((p) => p.id === payment.id);
      if (i === -1) return [payment, ...prev];
      const next = prev.slice();
      // Keep requester_name if the patch omitted it
      next[i] = {
        ...prev[i],
        ...payment,
        requester_name: payment.requester_name ?? prev[i].requester_name,
      };
      return next;
    });
  }, []);

  const removePayment = useCallback((id: string) => {
    suppressUntil.current = Date.now() + 900;
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);

    const onRow = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ): boolean => {
      if (Date.now() < suppressUntil.current) return true;

      const event = payload.eventType;
      const row = (payload.new ?? null) as Record<string, unknown> | null;
      const old = (payload.old ?? null) as Record<string, unknown> | null;

      if (event === "DELETE" && old?.id) {
        removePayment(String(old.id));
        return true;
      }

      if (!row?.id) return false;

      // Soft-delete via admin_delete_payment
      if (row.deleted_at) {
        removePayment(String(row.id));
        return true;
      }

      if (event === "INSERT" || event === "UPDATE") {
        const mapped = mapPayment(row);
        setPayments((prev) => {
          const i = prev.findIndex((p) => p.id === mapped.id);
          if (i === -1) {
            // New row: name may be missing — accept and skip network
            return [mapped, ...prev];
          }
          const next = prev.slice();
          next[i] = {
            ...prev[i],
            ...mapped,
            requester_name: prev[i].requester_name ?? mapped.requester_name,
          };
          return next;
        });
        return true;
      }

      return false;
    };

    const unsubscribe = subscribePayments({
      onRefresh: () => {
        if (Date.now() < suppressUntil.current) return;
        void load({ silent: true });
      },
      onRow,
    });

    return () => {
      requestVersion.current += 1;
      window.clearTimeout(t);
      unsubscribe();
    };
  }, [load, removePayment]);

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
