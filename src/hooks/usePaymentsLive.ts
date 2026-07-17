"use client";

/**
 * Re-export shared payments hook. Data lives in PaymentsProvider (one fetch +
 * one Realtime channel for the whole authenticated shell).
 */
export { usePayments as usePaymentsLive } from "@/components/PaymentsProvider";
