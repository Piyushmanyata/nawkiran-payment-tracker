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

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  // Start not-loading when Supabase env is missing so login can show setup help.
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const profileUserId = useRef<string | null>(null);

  const loadProfile = useCallback(
    async (userId?: string | null) => {
      if (!configured) {
        setProfile(null);
        profileUserId.current = null;
        return;
      }
      try {
        const p = await fetchMyProfile(userId);
        setProfile(p);
        profileUserId.current = p?.id ?? userId ?? null;
      } catch {
        setProfile(null);
        profileUserId.current = null;
      }
    },
    [configured]
  );

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    // Single path: onAuthStateChange fires INITIAL_SESSION with local session
    // (no getSession + getUser double hop). Profile uses user id, not getUser().
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setUser(next?.user ?? null);

      if (next?.user) {
        // Skip profile re-fetch on TOKEN_REFRESHED for the same user.
        if (profileUserId.current !== next.user.id) {
          void loadProfile(next.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        } else if (mounted) {
          setLoading(false);
        }
      } else {
        profileUserId.current = null;
        setProfile(null);
        if (mounted) setLoading(false);
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
      // onAuthStateChange will load profile; still await for callers that need it
      await loadProfile(data.user?.id);
      setLoading(false);
    },
    [loadProfile]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    profileUserId.current = null;
    setProfile(null);
  }, []);

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
