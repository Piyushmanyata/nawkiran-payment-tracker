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
import type { Payment, UserRole } from "@/types/database";
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

const CACHE_KEY = "nk_payments_v1";
/** Skip silent refreshes if data is fresher than this. */
const FRESH_MS = 20_000;

function readCache(): Payment[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Payment[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(rows: Payment[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch {
    // quota / private mode — ignore
  }
}

/**
 * Single app-wide payments cache + one Realtime channel.
 * Mount once under the authenticated shell so Open/History/Add share data
 * and tab switches are instant (no re-fetch).
 */
export function PaymentsProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>(() => readCache() ?? []);
  const [loading, setLoading] = useState(() => {
    const warm = readCache();
    return !(warm && warm.length > 0);
  });
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const hasLoaded = useRef(false);
  const lastLoadAt = useRef(0);
  /** Skip only the matching Realtime echo after a local optimistic mutation. */
  const suppressedPayments = useRef(new Map<string, number>());
  /** Requester meta for realtime inserts (no network). */
  const profileMeta = useRef(
    new Map<string, { name: string | null; role: UserRole | null }>()
  );

  const rememberMeta = useCallback((rows: Payment[]) => {
    for (const p of rows) {
      if (p.requested_by) {
        profileMeta.current.set(p.requested_by, {
          name: p.requester_name ?? null,
          role: p.requester_role ?? null,
        });
      }
      if (p.approved_by && p.approver_name) {
        profileMeta.current.set(p.approved_by, {
          name: p.approver_name,
          role: profileMeta.current.get(p.approved_by)?.role ?? null,
        });
      }
      if (p.denied_by && p.denier_name) {
        profileMeta.current.set(p.denied_by, {
          name: p.denier_name,
          role: profileMeta.current.get(p.denied_by)?.role ?? null,
        });
      }
      if (p.paid_by && p.payer_name) {
        profileMeta.current.set(p.paid_by, {
          name: p.payer_name,
          role: profileMeta.current.get(p.paid_by)?.role ?? null,
        });
      }
    }
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      if (
        opts?.silent &&
        !opts.force &&
        lastLoadAt.current &&
        Date.now() - lastLoadAt.current < FRESH_MS
      ) {
        return;
      }
      const version = ++requestVersion.current;
      if (!opts?.silent && !hasLoaded.current) setLoading(true);
      try {
        const rows = await fetchPayments();
        if (version !== requestVersion.current) return;
        setPayments(rows);
        rememberMeta(rows);
        writeCache(rows);
        setError(null);
        hasLoaded.current = true;
        lastLoadAt.current = Date.now();
      } catch (err) {
        if (version !== requestVersion.current) return;
        setError(userMessageFromError(err));
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [rememberMeta]
  );

  const upsertPayment = useCallback(
    (payment: Payment) => {
      suppressedPayments.current.set(payment.id, Date.now() + 900);
      setPayments((prev) => {
        const i = prev.findIndex((p) => p.id === payment.id);
        let next: Payment[];
        if (i === -1) {
          next = [payment, ...prev];
        } else {
          // Keep joined names when an RPC patch omits them; clear names with cleared IDs.
          const merged: Payment = {
            ...prev[i],
            ...payment,
            requester_name: payment.requester_name ?? prev[i].requester_name,
            requester_role: payment.requester_role ?? prev[i].requester_role,
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
          next = prev.slice();
          next[i] = merged;
        }
        writeCache(next);
        return next;
      });
      rememberMeta([payment]);
    },
    [rememberMeta]
  );

  const removePayment = useCallback((id: string) => {
    suppressedPayments.current.set(id, Date.now() + 900);
    setPayments((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeCache(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const warm = readCache();
    if (warm?.length) {
      rememberMeta(warm);
      hasLoaded.current = true;
      lastLoadAt.current = Date.now();
    }
    const t = window.setTimeout(
      () => void load({ silent: Boolean(warm?.length) }),
      0
    );

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
        const reqMeta = profileMeta.current.get(mapped.requested_by);
        const approverMeta = mapped.approved_by
          ? profileMeta.current.get(mapped.approved_by)
          : null;
        const denierMeta = mapped.denied_by
          ? profileMeta.current.get(mapped.denied_by)
          : null;
        const payerMeta = mapped.paid_by
          ? profileMeta.current.get(mapped.paid_by)
          : null;

        setPayments((prev) => {
          const i = prev.findIndex((p) => p.id === mapped.id);
          let next: Payment[];
          if (i === -1) {
            next = [
              {
                ...mapped,
                requester_name: reqMeta?.name ?? null,
                requester_role: reqMeta?.role ?? null,
                approver_name: approverMeta?.name ?? null,
                denier_name: denierMeta?.name ?? null,
                payer_name: payerMeta?.name ?? null,
              },
              ...prev,
            ];
          } else {
            next = prev.slice();
            next[i] = {
              ...prev[i],
              ...mapped,
              requester_name:
                prev[i].requester_name ?? reqMeta?.name ?? mapped.requester_name,
              requester_role:
                prev[i].requester_role ?? reqMeta?.role ?? mapped.requester_role,
              approver_name: mapped.approved_by
                ? (prev[i].approver_name ??
                  approverMeta?.name ??
                  mapped.approver_name)
                : null,
              denier_name: mapped.denied_by
                ? (prev[i].denier_name ?? denierMeta?.name ?? mapped.denier_name)
                : null,
              payer_name: mapped.paid_by
                ? (prev[i].payer_name ?? payerMeta?.name ?? mapped.payer_name)
                : null,
            };
          }
          writeCache(next);
          return next;
        });
        // Local patch is enough — no full network re-fetch.
        return true;
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
  }, [load, removePayment, rememberMeta]);

  const value = useMemo(
    () => ({
      payments,
      loading,
      error,
      setError,
      reload: () => load({ silent: true, force: true }),
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
