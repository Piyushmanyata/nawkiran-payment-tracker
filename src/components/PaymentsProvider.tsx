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
  /** Skip only the matching Realtime echo after a local optimistic mutation. */
  const suppressedPayments = useRef(new Map<string, number>());

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
    suppressedPayments.current.set(payment.id, Date.now() + 900);
    setPayments((prev) => {
      const i = prev.findIndex((p) => p.id === payment.id);
      if (i === -1) return [payment, ...prev];
      const next = prev.slice();
      // Keep joined names when an RPC patch omits them; clear names with cleared IDs.
      next[i] = {
        ...prev[i],
        ...payment,
        requester_name: payment.requester_name ?? prev[i].requester_name,
        approver_name: payment.approved_by
          ? (payment.approver_name ?? prev[i].approver_name)
          : null,
        denier_name: payment.denied_by
          ? (payment.denier_name ?? prev[i].denier_name)
          : null,
        payer_name: payment.paid_by
          ? (payment.payer_name ?? prev[i].payer_name)
          : null,
      };
      return next;
    });
  }, []);

  const removePayment = useCallback((id: string) => {
    suppressedPayments.current.set(id, Date.now() + 900);
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);

    const onRow = (
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>
    ): boolean => {
      const event = payload.eventType;
      const row = (payload.new ?? null) as Record<string, unknown> | null;
      const old = (payload.old ?? null) as Record<string, unknown> | null;
      const changedId = String(row?.id ?? old?.id ?? "");
      const suppressedUntil = suppressedPayments.current.get(changedId) ?? 0;
      if (Date.now() < suppressedUntil) {
        suppressedPayments.current.delete(changedId);
        return true;
      }
      if (suppressedUntil) suppressedPayments.current.delete(changedId);

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
            approver_name: mapped.approved_by ? prev[i].approver_name : null,
            denier_name: mapped.denied_by ? prev[i].denier_name : null,
            payer_name: mapped.paid_by ? prev[i].payer_name : null,
          };
          return next;
        });
        // Re-fetch once so FK-joined actor names stay correct on other devices.
        return false;
      }

      return false;
    };

    const unsubscribe = subscribePayments({
      onRefresh: () => {
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
