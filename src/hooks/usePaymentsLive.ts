"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchPayments } from "@/lib/payments";
import { subscribePayments } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import type { Payment } from "@/types/database";

/** Load payments and keep them in sync via Realtime + online/visibility fallbacks. */
export function usePaymentsLive() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await fetchPayments();
      setPayments(rows);
      setError(null);
    } catch (err) {
      setError(userMessageFromError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      void fetchPayments()
        .then((rows) => {
          if (cancelled) return;
          setPayments(rows);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(userMessageFromError(err));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    // Defer so the effect body does not set state synchronously (React 19 lint).
    const t = window.setTimeout(run, 0);
    const unsubscribe = subscribePayments(run);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      unsubscribe();
    };
  }, []);

  return { payments, loading, error, setError, reload: load };
}
