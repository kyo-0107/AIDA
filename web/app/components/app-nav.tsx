import Link from "next/link";
import { signOut } from "@/app/actions";

const TABS = [
  { key: "projects", label: "プロジェクト一覧", href: "/projects" },
  { key: "ai", label: "AI", href: "/plan" },
  { key: "calendar", label: "カレンダー", href: "/" },
  { key: "profile", label: "自分の編集", href: "/profile" },
] as const;

export default function AppNav({
  active,
  displayName,
}: {
  active: "projects" | "ai" | "calendar" | "profile" | null;
  displayName: string;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-[20px] bg-surface shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-navy-deep to-indigo text-sm font-bold text-gold">
            {displayName.slice(0, 1) || "?"}
          </span>
          <span className="font-display text-sm font-bold text-navy-deep">{displayName}</span>
        </Link>

        <div className="flex items-center gap-2">
          <form action="/projects" method="GET" className="flex items-center">
            <input
              name="q"
              placeholder="プロジェクトを検索"
              className="w-40 rounded-l-[10px] border border-r-0 border-line px-3 py-1.5 text-xs sm:w-52"
            />
            <button className="rounded-r-[10px] border border-line bg-line/50 px-3 py-1.5 text-xs font-bold text-navy">
              検索
            </button>
          </form>
          <Link
            href="/profile"
            aria-label="設定"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-muted hover:bg-line/40"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <form action={signOut}>
            <button className="rounded-[10px] border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted">
              ログアウト
            </button>
          </form>
        </div>
      </div>

      <nav className="mt-3 flex border-t border-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={`flex-1 border-b-2 px-3 py-2.5 text-center text-xs font-bold ${
              active === t.key
                ? "border-navy-deep text-navy-deep"
                : "border-transparent text-muted hover:text-navy"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
