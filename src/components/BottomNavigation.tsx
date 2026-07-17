"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/open", label: "Open" },
  { href: "/add", label: "Add" },
  { href: "/history", label: "History" },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex min-h-14 flex-col items-center justify-center text-sm font-semibold ${
                  active ? "text-blue-600" : "text-slate-500"
                }`}
              >
                <span
                  className={`mb-0.5 h-1 w-8 rounded-full ${
                    active ? "bg-blue-600" : "bg-transparent"
                  }`}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
