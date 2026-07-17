"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

  const loadProfile = useCallback(async () => {
    if (!configured) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchMyProfile();
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, [configured]);

  useEffect(() => {
    if (!configured) return;

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    // Auth session restore is an external system sync (Supabase client).
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session) {
        await loadProfile();
      }
      if (mounted) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (next) {
        void loadProfile();
      } else {
        setProfile(null);
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      await loadProfile();
    },
    [loadProfile]
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      loading,
      configured,
      session,
      user,
      profile,
      refreshProfile: loadProfile,
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
