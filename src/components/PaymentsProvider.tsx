"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fetchPayments } from "@/lib/payments";
import { mapPayment } from "@/lib/map-payment";
import { subscribePayments } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import { writePaymentsCache, readPaymentsCache } from "@/lib/cache";
import type { Payment, UserRole } from "@/types/database";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

interface PaymentsState {
  payments: Payment[];
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  upsertPayment: (payment: Payment) => void;
  removePayment: (id: string) => void;
}

const PaymentsContext = createContext<PaymentsState | null>(null);

const FRESH_MS = 60_000;
const emptySubscribe = () => () => {};

function useWarmPayments(): Payment[] | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => readPaymentsCache(),
    () => null
  );
}

/**
 * Single app-wide payments cache + one Realtime channel.
 * Disk hydrate via useSyncExternalStore → no spinner on reload.
 */
export function PaymentsProvider({ children }: { children: ReactNode }) {
  const warm = useWarmPayments();
  const [live, setLive] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const lastLoadAt = useRef(0);
  const liveRef = useRef<Payment[] | null>(null);
  const warmRef = useRef<Payment[] | null>(null);

  const suppressedPayments = useRef(new Map<string, number>());
  const profileMeta = useRef(
    new Map<string, { name: string | null; role: UserRole | null }>()
  );

  const payments = useMemo(() => live ?? warm ?? [], [live, warm]);
  // Block only when neither cache nor network data exists yet.
  const loading = live === null && warm === null;

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

  useEffect(() => {
    warmRef.current = warm;
    liveRef.current = live;
  }, [warm, live]);

  useEffect(() => {
    if (warm?.length) rememberMeta(warm);
  }, [warm, rememberMeta]);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const now = performance.now();
      if (
        opts?.silent &&
        !opts.force &&
        lastLoadAt.current &&
        now - lastLoadAt.current < FRESH_MS
      ) {
        return;
      }
      const version = ++requestVersion.current;
      try {
        const rows = await fetchPayments();
        if (version !== requestVersion.current) return;
        setLive(rows);
        rememberMeta(rows);
        writePaymentsCache(rows);
        setError(null);
        lastLoadAt.current = performance.now();
      } catch (err) {
        if (version !== requestVersion.current) return;
        if (liveRef.current === null && warmRef.current === null) {
          setError(userMessageFromError(err));
        }
      }
    },
    [rememberMeta]
  );

  const upsertPayment = useCallback(
    (payment: Payment) => {
      suppressedPayments.current.set(payment.id, performance.now() + 900);
      setLive((prev) => {
        const base = prev ?? warmRef.current ?? [];
        const i = base.findIndex((p) => p.id === payment.id);
        let next: Payment[];
        if (i === -1) {
          next = [payment, ...base];
        } else {
          const merged: Payment = {
            ...base[i],
            ...payment,
            requester_name: payment.requester_name ?? base[i].requester_name,
            requester_role: payment.requester_role ?? base[i].requester_role,
            approver_name: payment.approved_by
              ? (payment.approver_name ?? base[i].approver_name)
              : null,
            denier_name: payment.denied_by
              ? (payment.denier_name ?? base[i].denier_name)
              : null,
            payer_name: payment.paid_by
              ? (payment.payer_name ?? base[i].payer_name)
              : null,
          };
          next = base.slice();
          next[i] = merged;
        }
        writePaymentsCache(next);
        return next;
      });
      rememberMeta([payment]);
    },
    [rememberMeta]
  );

  const removePayment = useCallback((id: string) => {
    suppressedPayments.current.set(id, performance.now() + 900);
    setLive((prev) => {
      const base = prev ?? warmRef.current ?? [];
      const next = base.filter((p) => p.id !== id);
      writePaymentsCache(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (warmRef.current !== null) {
      lastLoadAt.current = performance.now();
    }

    const t = window.setTimeout(
      () => void load({ silent: warmRef.current !== null }),
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
      if (performance.now() < suppressedUntil) {
        suppressedPayments.current.delete(changedId);
        return true;
      }
      if (suppressedUntil) suppressedPayments.current.delete(changedId);

      if (event === "DELETE" && old?.id) {
        removePayment(String(old.id));
        return true;
      }

      if (!row?.id) return false;

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

        setLive((prev) => {
          const base = prev ?? warmRef.current ?? [];
          const i = base.findIndex((p) => p.id === mapped.id);
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
              ...base,
            ];
          } else {
            next = base.slice();
            next[i] = {
              ...base[i],
              ...mapped,
              requester_name:
                base[i].requester_name ?? reqMeta?.name ?? mapped.requester_name,
              requester_role:
                base[i].requester_role ?? reqMeta?.role ?? mapped.requester_role,
              approver_name: mapped.approved_by
                ? (base[i].approver_name ??
                  approverMeta?.name ??
                  mapped.approver_name)
                : null,
              denier_name: mapped.denied_by
                ? (base[i].denier_name ?? denierMeta?.name ?? mapped.denier_name)
                : null,
              payer_name: mapped.paid_by
                ? (base[i].payer_name ?? payerMeta?.name ?? mapped.payer_name)
                : null,
            };
          }
          writePaymentsCache(next);
          return next;
        });
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
  }, [load, removePayment]);

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
