/**
 * Instant-paint cache (localStorage). Survives reloads and new tabs.
 * Stale-while-revalidate: UI always reads this first; network patches later.
 */

import type { Payment, Profile } from "@/types/database";

const PAYMENTS_KEY = "nk_payments_v2";
const PROFILE_KEY = "nk_profile_v1";
const AUTH_HINT_KEY = "nk_auth_hint_v1";
const META_KEY = "nk_cache_meta_v1";

type CacheMeta = { paymentsAt: number; profileAt: number };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private mode
  }
}

function readMeta(): CacheMeta {
  return readJson<CacheMeta>(META_KEY) ?? { paymentsAt: 0, profileAt: 0 };
}

function writeMeta(patch: Partial<CacheMeta>): void {
  writeJson(META_KEY, { ...readMeta(), ...patch });
}

// —— Payments ——

export function readPaymentsCache(): Payment[] | null {
  const parsed = readJson<Payment[]>(PAYMENTS_KEY);
  return Array.isArray(parsed) ? parsed : null;
}

export function writePaymentsCache(rows: Payment[]): void {
  writeJson(PAYMENTS_KEY, rows);
  writeMeta({ paymentsAt: Date.now() });
}

export function paymentsCacheAgeMs(): number {
  const at = readMeta().paymentsAt;
  return at ? Date.now() - at : Number.POSITIVE_INFINITY;
}

// —— Profile / auth hint (skip full-screen auth spinner) ——

export function readProfileCache(): Profile | null {
  const p = readJson<Profile>(PROFILE_KEY);
  return p && typeof p.id === "string" ? p : null;
}

export function writeProfileCache(profile: Profile | null): void {
  if (!profile) {
    if (canUseStorage()) {
      try {
        localStorage.removeItem(PROFILE_KEY);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  writeJson(PROFILE_KEY, profile);
  writeMeta({ profileAt: Date.now() });
}

/** True when we recently had a session — paint shell immediately. */
export function readAuthHint(): boolean {
  if (!canUseStorage()) return false;
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAuthHint(signedIn: boolean): void {
  if (!canUseStorage()) return;
  try {
    if (signedIn) localStorage.setItem(AUTH_HINT_KEY, "1");
    else localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthCaches(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(AUTH_HINT_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(PAYMENTS_KEY);
    localStorage.removeItem(META_KEY);
    // legacy session keys
    sessionStorage.removeItem("nk_payments_v1");
  } catch {
    /* ignore */
  }
}
