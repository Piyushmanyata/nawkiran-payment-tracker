"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPayments } from "@/lib/payments";
import { subscribePayments } from "@/lib/realtime";
import { userMessageFromError } from "@/lib/errors";
import type { Payment } from "@/types/database";

/** Load payments and keep them in sync via Realtime + online/visibility fallbacks. */
export function usePaymentsLive() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const rows = await fetchPayments();
      if (version !== requestVersion.current) return;
      setPayments(rows);
      setError(null);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(userMessageFromError(err));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = () => void load();

    // Defer so the effect body does not set state synchronously (React 19 lint).
    const t = window.setTimeout(run, 0);
    const unsubscribe = subscribePayments(run);

    return () => {
      requestVersion.current += 1;
      window.clearTimeout(t);
      unsubscribe();
    };
  }, [load]);

  return { payments, loading, error, setError, reload: load };
}
