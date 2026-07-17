"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { BottomNavigation } from "@/components/BottomNavigation";
import { OfflineBanner } from "@/components/OfflineBanner";

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

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 text-slate-600">
        Loading...
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
      <div className="flex min-h-full items-center justify-center bg-slate-50 text-slate-600">
        Redirecting...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50">
      <OfflineBanner />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Nawkiran Payments</p>
            <p className="text-xs text-slate-500">
              {profile?.full_name ?? "User"}
              {profile?.role ? ` · ${profile.role}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 pb-24 pt-4">{children}</main>
      <BottomNavigation />
    </div>
  );
}
