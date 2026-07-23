"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { PaymentsProvider } from "@/components/PaymentsProvider";
import { BottomNavigation } from "@/components/BottomNavigation";
import { OfflineBanner } from "@/components/OfflineBanner";
import { roleLabel } from "@/lib/ui";

const PushNotifications = dynamic(
  () => import("./PushNotifications").then((mod) => mod.PushNotifications),
  { ssr: false }
);

export function AppShell({ children }: { children: ReactNode }) {
  const { loading, configured, session, profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (loading) return;
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
  }, [loading, configured, session, isLogin, router]);

  useEffect(() => {
    if (!session) return;
    const prefetch = router.prefetch;
    const run = () => {
      prefetch("/open");
      prefetch("/add");
      prefetch("/todo");
    };
    const ric = window.requestIdleCallback?.bind(window);
    if (ric) {
      const id = ric(run, { timeout: 1200 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(run, 0);
    return () => window.clearTimeout(t);
  }, [session, router.prefetch]);

  // Cold auth only — warm profile/hint path starts loading=false.
  if (loading) {
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

  if (!session) {
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
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-8 py-3">
            <div className="flex items-center gap-6 min-w-0">
              <div className="min-w-0">
                <p className="text-base font-extrabold text-slate-900 tracking-tight">Nawkiran</p>
                <p className="truncate text-xs text-slate-500 font-medium">
                  {name}
                  {role ? ` · ${role}` : ""}
                </p>
              </div>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
                <Link
                  href="/open"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    pathname === "/open" || pathname === "/"
                      ? "bg-white text-blue-600 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Payments
                </Link>
                <Link
                  href="/todo"
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    pathname === "/todo"
                      ? "bg-white text-blue-600 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  To-do
                </Link>
              </nav>
            </div>

            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-9 shrink-0 rounded-xl px-3 text-xs font-bold text-slate-600 border border-slate-200 transition hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
            >
              Log out
            </button>
          </div>
          <PushNotifications />
        </header>
        <main className="mx-auto max-w-7xl px-4 md:px-8 pb-28 md:pb-8 pt-4 md:pt-6">{children}</main>
        <BottomNavigation />
      </div>
    </PaymentsProvider>
  );
}

