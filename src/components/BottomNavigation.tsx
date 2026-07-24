"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const tabs = [
  {
    href: "/open",
    label: "Payments",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h10M4 17h7" />
      </svg>
    ),
  },
  {
    href: "/todo",
    label: "To-do",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const [openTodoCount, setOpenTodoCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    async function loadCount() {
      try {
        // Exclude future-scheduled recurring todos (hidden from Open tab by isTodoVisible).
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const { count, error } = await supabase
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("status", "open")
          .or(`due_date.is.null,due_date.lte.${today}`);
        if (!error && alive) setOpenTodoCount(count ?? 0);
      } catch {
        /* table may not exist until migration */
      }
    }

    void loadCount();
    const channel = supabase
      .channel("todos-nav-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos" },
        () => {
          void loadCount();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href ||
            (tab.href === "/open" && pathname === "/");
          const showBadge = tab.href === "/todo" && openTodoCount > 0;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition ${
                  active ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <span
                  className={`relative rounded-full p-1 ${
                    active ? "bg-blue-50 text-blue-600" : ""
                  }`}
                >
                  {tab.icon}
                  {showBadge ? (
                    <span className="absolute -right-1.5 -top-1 min-w-[1.1rem] rounded-full bg-blue-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                      {openTodoCount > 99 ? "99+" : openTodoCount}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
