"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTodos } from "@/components/TodosProvider";
import { isRecurringTodo } from "@/lib/todos";

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
  {
    href: "/attendance",
    label: "Attendance",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l2 2 4-4" />
      </svg>
    ),
  },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const { todos } = useTodos();

  // Matches the /todo "Open" tab, which hides recurring items until they are due.
  const openTodoCount = useMemo(
    () => todos.filter((t) => t.status === "open" && !isRecurringTodo(t)).length,
    [todos]
  );

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
