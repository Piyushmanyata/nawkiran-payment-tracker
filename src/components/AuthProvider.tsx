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
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";
import { fetchMyProfile } from "@/lib/payments";
import {
  clearAuthCaches,
  readAuthHint,
  readProfileCache,
  writeAuthHint,
  writeProfileCache,
} from "@/lib/cache";
import type { Profile } from "@/types/database";

interface AuthState {
  loading: boolean;
  ready: boolean;
  authHint: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const emptySubscribe = () => () => {};

function useWarmProfile(): Profile | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => readProfileCache(),
    () => null
  );
}

function useWarmAuthHint(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => readAuthHint(),
    () => false
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const warmProfile = useWarmProfile();
  const warmHint = useWarmAuthHint();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authSettled, setAuthSettled] = useState(!configured);
  const profileUserId = useRef<string | null>(warmProfile?.id ?? null);

  // Instant from disk; live profile overrides once fetched.
  const displayProfile = profile ?? warmProfile;
  const authHint = Boolean(session) || warmHint || Boolean(warmProfile);
  // Only block cold first visit (no cache, auth not settled).
  const loading = configured && !authSettled && !authHint;
  const ready = !configured || authSettled || authHint;

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
        if (!profileUserId.current) {
          setProfile(null);
          writeProfileCache(null);
        }
      }
    },
    [configured]
  );

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);

      if (next?.user) {
        writeAuthHint(true);
        if (profileUserId.current !== next.user.id) {
          void loadProfile(next.user.id).finally(() => {
            if (mounted) setAuthSettled(true);
          });
        } else {
          if (mounted) setAuthSettled(true);
          void loadProfile(next.user.id);
        }
      } else {
        profileUserId.current = null;
        setProfile(null);
        clearAuthCaches();
        if (mounted) setAuthSettled(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [configured, loadProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      writeAuthHint(true);
      await loadProfile(data.user?.id);
      setAuthSettled(true);
    },
    [loadProfile]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    profileUserId.current = null;
    setProfile(null);
    clearAuthCaches();
  }, []);

  const value = useMemo(
    () => ({
      loading,
      ready,
      authHint,
      configured,
      session,
      user,
      profile: displayProfile,
      refreshProfile: () => loadProfile(user?.id),
      signIn,
      signOut,
    }),
    [
      loading,
      ready,
      authHint,
      configured,
      session,
      user,
      displayProfile,
      loadProfile,
      signIn,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
