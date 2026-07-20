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
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { fetchMyProfile } from "@/lib/payments";
import {
  clearAuthCaches,
  writeAuthHint,
  writeProfileCache,
  readProfileCache,
} from "@/lib/cache";
import type { Profile } from "@/types/database";

interface AuthState {
  loading: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Never leave the full-screen spinner forever. */
const AUTH_TIMEOUT_MS = 4_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileUserId = useRef<string | null>(null);
  const settled = useRef(false);

  const markSettled = useCallback(() => {
    settled.current = true;
    setLoading(false);
  }, []);

  const loadProfile = useCallback(
    async (userId?: string | null) => {
      if (!configured) {
        setProfile(null);
        profileUserId.current = null;
        writeProfileCache(null);
        return;
      }
      try {
        const p = await fetchMyProfile(userId);
        setProfile(p);
        profileUserId.current = p?.id ?? userId ?? null;
        writeProfileCache(p);
      } catch {
        // Fall back to disk cache if network fails mid-session.
        const warm = readProfileCache();
        if (warm && (!userId || warm.id === userId)) {
          setProfile(warm);
          profileUserId.current = warm.id;
        }
      }
    },
    [configured]
  );

  useEffect(() => {
    if (!configured) {
      // External config only — settle after paint.
      const t = window.setTimeout(() => markSettled(), 0);
      return () => window.clearTimeout(t);
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    // Prefill name from disk (async tick → lint-safe).
    const warmTick = window.setTimeout(() => {
      if (!mounted) return;
      const warm = readProfileCache();
      if (warm) {
        setProfile(warm);
        profileUserId.current = warm.id;
      }
    }, 0);

    const timeout = window.setTimeout(() => {
      if (mounted) markSettled();
    }, AUTH_TIMEOUT_MS);

    const applySession = (next: Session | null) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);

      if (next?.user) {
        writeAuthHint(true);
        // Session is enough to enter app — profile loads in background.
        markSettled();
        void loadProfile(next.user.id);
      } else {
        profileUserId.current = null;
        setProfile(null);
        clearAuthCaches();
        markSettled();
      }
    };

    // Local storage session first (fast, no network).
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) {
        markSettled();
        return;
      }
      if (data.session) {
        applySession(data.session);
      }
      // If null, wait for onAuthStateChange INITIAL_SESSION (or timeout).
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      window.clearTimeout(warmTick);
      subscription.unsubscribe();
    };
  }, [configured, loadProfile, markSettled]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      writeAuthHint(true);
      setSession(data.session);
      setUser(data.user);
      markSettled();
      void loadProfile(data.user?.id);
    },
    [loadProfile, markSettled]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    profileUserId.current = null;
    setSession(null);
    setUser(null);
    setProfile(null);
    clearAuthCaches();
    markSettled();
  }, [markSettled]);

  const value = useMemo(
    () => ({
      loading,
      configured,
      session,
      user,
      profile,
      refreshProfile: () => loadProfile(user?.id),
      signIn,
      signOut,
    }),
    [loading, configured, session, user, profile, loadProfile, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
