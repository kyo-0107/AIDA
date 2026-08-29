import Link from "next/link";
import { createProject, joinProject } from "@/app/actions";

type ProjectRow = { id: number; name: string };

export default function Sidebar({ projects }: { projects: ProjectRow[] }) {
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-surface p-5">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-navy-deep to-indigo shadow-[0_8px_16px_-6px_oklch(28%_0.09_275_/_0.5)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M8 2v4M16 2v4M3 10h18" />
            <path d="M8.5 15l2 2 4-4" />
          </svg>
        </span>
        <span className="font-display text-base font-bold text-navy-deep">DIGIT</span>
      </Link>

      <div className="flex items-center justify-between">
        <h2 className="font-display text-[12.5px] font-bold text-navy-deep">プロジェクト</h2>
        <Link href="/projects" className="text-[10.5px] font-bold text-navy hover:underline">
          すべて見る
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-xs text-muted">参加しているプロジェクトがありません。</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/project/${p.id}`}
                className="block truncate rounded-[8px] px-2.5 py-1.5 text-sm font-semibold text-ink hover:bg-line/40"
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-dashed border-line pt-4">
        <details className="group">
          <summary className="cursor-pointer list-none rounded-[10px] border border-dashed border-line px-3 py-2 text-center text-xs font-bold text-navy hover:bg-line/30">
            ＋ 新規作成
          </summary>
          <form action={createProject} className="mt-2 flex flex-col gap-2">
            <input
              name="name"
              placeholder="プロジェクト名"
              required
              className="rounded-[8px] border border-line px-2.5 py-2 text-xs"
            />
            <input
              name="password"
              placeholder="参加パスワード(自分で決める)"
              required
              className="rounded-[8px] border border-line px-2.5 py-2 text-xs"
            />
            <input
              name="summary"
              placeholder="概要(任意)"
              className="rounded-[8px] border border-line px-2.5 py-2 text-xs"
            />
            <button className="rounded-[8px] bg-navy-deep px-3 py-1.5 text-xs font-bold text-gold">
              作成する
            </button>
          </form>
        </details>

        <details className="group">
          <summary className="cursor-pointer list-none rounded-[10px] border border-dashed border-line px-3 py-2 text-center text-xs font-bold text-navy hover:bg-line/30">
            🔑 参加する
          </summary>
          <form action={joinProject} className="mt-2 flex flex-col gap-2">
            <input
              name="project_id"
              type="number"
              placeholder="プロジェクト番号"
              required
              className="rounded-[8px] border border-line px-2.5 py-2 text-xs"
            />
            <input
              name="password"
              placeholder="パスワード"
              required
              className="rounded-[8px] border border-line px-2.5 py-2 text-xs"
            />
            <button className="rounded-[8px] bg-navy px-3 py-1.5 text-xs font-bold text-white">
              参加する
            </button>
          </form>
        </details>
      </div>
    </aside>
  );
}
