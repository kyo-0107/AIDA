import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { aiRankProjects } from "@/lib/ai-search";

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
  const { supabase } = await getCurrentUserOrRedirect();

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

  let usedAiSearch = false;
  if (q.trim()) {
    const rankedIds = await aiRankProjects(
      q,
      projects.map((p) => ({ id: p.id, name: p.name, summary: p.summary })),
    );
    if (rankedIds) {
      usedAiSearch = true;
      const projectById = new Map(projects.map((p) => [p.id, p]));
      projects = rankedIds.map((id) => projectById.get(id)).filter((p): p is ProjectRow => Boolean(p));
    } else {
      // AI検索が失敗/タイムアウトした場合は単純な部分一致にフォールバック
      const needle = q.trim().toLowerCase();
      projects = projects.filter(
        (p) => p.name.toLowerCase().includes(needle) || (p.summary ?? "").toLowerCase().includes(needle),
      );
    }
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold text-navy-deep">プロジェクト一覧</h1>
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

      {q.trim() && (
        <p className="text-xs text-muted">
          {usedAiSearch ? (
            <>
              <span className="rounded-full bg-plum/15 px-2 py-0.5 font-bold text-plum">AI検索</span>{" "}
              「{q}」に関連度が高い順に表示しています。
            </>
          ) : (
            <>「{q}」で名前・概要をキーワード検索しています(AI検索は利用できませんでした)。</>
          )}
        </p>
      )}

      <p className="text-xs text-muted">
        新規作成・参加は左のサイドバーの「＋ 新規作成」「🔑 参加する」から行えます。
      </p>

      {projects.length === 0 ? (
        <p className="text-sm text-muted">該当するプロジェクトがありません。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
