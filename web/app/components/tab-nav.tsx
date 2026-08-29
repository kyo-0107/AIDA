"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "calendar", label: "カレンダー", href: "/" },
  { key: "tasks", label: "タスク一覧", href: "/tasks" },
  { key: "ai", label: "AI", href: "/plan" },
] as const;

export default function TabNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex border-b border-line bg-surface px-6">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`border-b-2 px-4 py-2.5 text-xs font-bold ${
            isActive(t.href)
              ? "border-navy-deep text-navy-deep"
              : "border-transparent text-muted hover:text-navy"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
