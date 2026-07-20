"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PaymentsProvider } from "@/components/PaymentsProvider";
import { BottomNavigation } from "@/components/BottomNavigation";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PushNotifications } from "@/components/PushNotifications";
import { roleLabel } from "@/lib/ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, ready, configured, session, profile, authHint, signOut } =
    useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  // Warm path: last-visit hint or live session → paint app shell immediately.
  const showApp = Boolean(session) || (authHint && (loading || !session));

  useEffect(() => {
    if (!ready || loading) return;
    if (!configured && !isLogin) {
      router.replace("/login");
      return;
    }
    if (!session && !isLogin) {
      router.replace("/login");
      return;
    }
    if (session && isLogin) {
      router.replace("/open");
    }
  }, [ready, loading, configured, session, isLogin, router]);

  useEffect(() => {
    if (!session && !authHint) return;
    const run = () => {
      router.prefetch("/open");
      router.prefetch("/add");
      router.prefetch("/history");
    };
    const ric = window.requestIdleCallback?.bind(window);
    if (ric) {
      const id = ric(run, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }, [session, authHint, router]);

  // Cold first visit only (no cache, no session yet).
  if (!ready || (loading && !authHint && !session)) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        <p className="text-sm font-medium">Loading…</p>
      </div>
    );
  }

  if (isLogin) {
    return (
      <div className="min-h-full bg-slate-50">
        <OfflineBanner />
        {children}
      </div>
    );
  }

  if (!showApp) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 text-sm text-slate-600">
        Redirecting…
      </div>
    );
  }

  const name = profile?.full_name?.trim() || "User";
  const role = roleLabel(profile?.role);

  return (
    <PaymentsProvider>
      <div className="min-h-full bg-slate-50">
        <OfflineBanner />
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Nawkiran Payments</p>
              <p className="truncate text-xs text-slate-500">
                {name}
                {role ? ` · ${role}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-10 shrink-0 rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 active:bg-slate-200"
            >
              Log out
            </button>
          </div>
          <PushNotifications />
        </header>
        <main className="mx-auto max-w-lg px-4 pb-28 pt-4">{children}</main>
        <BottomNavigation />
      </div>
    </PaymentsProvider>
  );
}
