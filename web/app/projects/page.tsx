import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import AppNav from "@/app/components/app-nav";
import { createProject, joinProject } from "@/app/actions";

const ACCENTS = [
  "from-navy to-blush",
  "from-teal to-blush",
  "from-plum to-gold",
  "from-plum to-orchid",
];

const STATUS_STYLE: Record<string, string> = {
  進行中: "bg-sage text-navy-deep",
  完了: "bg-ink/70 text-white",
};

function statusStyle(status: string) {
  return STATUS_STYLE[status] ?? "bg-gold text-navy-deep";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const { supabase, displayName } = await getCurrentUserOrRedirect();

  type ProjectRow = { id: number; name: string; summary: string | null; status: string };
  type MembershipRow = { projects: ProjectRow | null };

  const { data: rows } = await supabase
    .from("project_members")
    .select("projects(*)")
    .returns<MembershipRow[]>();

  let projects = (rows ?? [])
    .map((r) => r.projects)
    .filter((p): p is ProjectRow => Boolean(p));
  const projectIds = projects.map((p) => p.id);

  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    projects = projects.filter((p) => p.name.toLowerCase().includes(needle));
  }
  if (status.trim()) {
    projects = projects.filter((p) => p.status === status);
  }

  type TaskSummary = { id: number; status: string; project_id: number };
  const { data: allTasks } = projectIds.length
    ? await supabase
        .from("tasks")
        .select("id, status, project_id")
        .in("project_id", projectIds)
        .neq("approval_status", "rejected")
        .returns<TaskSummary[]>()
    : { data: [] as TaskSummary[] };

  const tasksByProject = new Map<number, TaskSummary[]>();
  for (const t of allTasks ?? []) {
    const list = tasksByProject.get(t.project_id) ?? [];
    list.push(t);
    tasksByProject.set(t.project_id, list);
  }
  function progressOf(projectId: number) {
    const list = tasksByProject.get(projectId) ?? [];
    const done = list.filter((t) => t.status === "完了").length;
    return { done, total: list.length };
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <AppNav active="projects" displayName={displayName} />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <section className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-navy-deep via-navy to-indigo p-7 shadow-[0_20px_40px_-16px_oklch(20%_0.08_275_/_0.5)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blush opacity-20" />
          <h2 className="relative mb-4 font-display text-lg font-bold text-white">プロジェクトを作成</h2>
          <form action={createProject} className="relative flex flex-col gap-3">
            <input
              name="name"
              placeholder="プロジェクト名"
              required
              className="rounded-[10px] border border-white/15 bg-white/95 px-3.5 py-3 text-sm"
            />
            <input
              name="summary"
              placeholder="概要(Botが答えるときに使います)"
              className="rounded-[10px] border border-white/15 bg-white/95 px-3.5 py-3 text-sm"
            />
            <input
              name="password"
              placeholder="参加パスワード(自分で決める)"
              required
              className="rounded-[10px] border border-white/15 bg-white/95 px-3.5 py-3 text-sm"
            />
            <input
              name="slack_channel"
              placeholder="通知先チャンネルID(あとから設定も可)"
              className="rounded-[10px] border border-white/15 bg-white/95 px-3.5 py-3 text-sm"
            />
            <button className="self-start rounded-[10px] bg-gold px-5 py-2.5 text-sm font-bold tracking-wide text-navy-deep">
              作成する
            </button>
            <p className="text-xs font-medium text-white/70">
              作成すると「プロジェクト番号」が自動採番されます(重複防止用)。番号とパスワードの両方を、参加してほしい人に伝えてください。
            </p>
          </form>
        </section>

        <section className="rounded-[20px] bg-surface p-7 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
          <h2 className="mb-4 font-display text-lg font-bold text-navy-deep">プロジェクトに参加</h2>
          <form action={joinProject} className="flex flex-col gap-3">
            <input
              name="project_id"
              type="number"
              placeholder="プロジェクト番号"
              required
              className="rounded-[10px] border border-line px-3.5 py-3 text-sm"
            />
            <input
              name="password"
              placeholder="パスワード"
              required
              className="rounded-[10px] border border-line px-3.5 py-3 text-sm"
            />
            <button className="self-start rounded-[10px] bg-navy-deep px-5 py-2.5 text-sm font-bold text-gold">
              参加する
            </button>
          </form>
        </section>
      </div>

      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-navy-deep">プロジェクト一覧</h2>
        <form action="/projects" method="GET" className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="キーワードで絞り込み"
            className="rounded-[10px] border border-line px-3 py-1.5 text-xs"
          />
          <select name="status" defaultValue={status} className="rounded-[10px] border border-line px-3 py-1.5 text-xs">
            <option value="">すべての状態</option>
            <option value="進行中">進行中</option>
            <option value="完了">完了</option>
          </select>
          <button className="rounded-[10px] bg-line/60 px-3 py-1.5 text-xs font-bold text-navy">絞り込む</button>
        </form>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-muted">該当するプロジェクトがありません。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((p) => {
            const { done, total } = progressOf(p.id);
            return (
              <Link
                key={p.id}
                href={`/project/${p.id}`}
                className="relative flex flex-col gap-3 overflow-hidden rounded-[18px] bg-surface p-5 pl-7 shadow-[0_10px_24px_-12px_oklch(28%_0.09_275_/_0.18)] transition hover:shadow-[0_14px_28px_-12px_oklch(28%_0.09_275_/_0.28)]"
              >
                <div className={`absolute bottom-0 left-0 top-0 w-1.5 bg-gradient-to-b ${ACCENTS[p.id % ACCENTS.length]}`} />
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold text-ink">{p.name}</span>
                  <span className={`rounded-full px-3 py-1 text-[10.5px] font-bold tracking-wide ${statusStyle(p.status)}`}>
                    {p.status}
                  </span>
                </div>
                <div className="text-sm font-medium text-muted">{p.summary || "(概要が未入力です)"}</div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs font-bold text-navy">
                    <span>進捗</span>
                    <span>{done} / {total} 件完了</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-navy to-blush transition-all"
                      style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
