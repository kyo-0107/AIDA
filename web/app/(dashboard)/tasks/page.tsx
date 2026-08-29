import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import TaskRow from "@/app/(dashboard)/project/[id]/task-row";

type ProjectRow = { id: number; name: string };
type Profile = { display_name: string | null; email: string };
type TaskRowData = {
  id: number;
  title: string;
  progress_comment: string | null;
  priority: string;
  due_date: string | null;
  estimated_hours: number | null;
  status: string;
  source: string;
  source_url: string | null;
  approval_status: "pending" | "approved" | "rejected";
  project_id: number;
  profiles: Profile | null;
};

const SORTS = [
  { key: "due", label: "期限順" },
  { key: "priority", label: "優先度順" },
  { key: "project", label: "プロジェクト別" },
] as const;

const PRIORITY_RANK: Record<string, number> = { 高: 0, 中: 1, 低: 2 };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; project?: string }>;
}) {
  const { sort = "due", project = "" } = await searchParams;
  const { supabase } = await getCurrentUserOrRedirect();

  type MembershipRow = { projects: ProjectRow | null };
  const { data: rows } = await supabase
    .from("project_members")
    .select("projects(id, name)")
    .returns<MembershipRow[]>();
  const projects = (rows ?? [])
    .map((r) => r.projects)
    .filter((p): p is ProjectRow => Boolean(p));
  const projectIds = projects.map((p) => p.id);
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const scopedIds = project ? projectIds.filter((id) => String(id) === project) : projectIds;

  const { data: tasks } = scopedIds.length
    ? await supabase
        .from("tasks")
        .select(
          "id, title, progress_comment, priority, due_date, estimated_hours, status, source, source_url, approval_status, project_id, profiles(display_name, email)",
        )
        .in("project_id", scopedIds)
        .neq("approval_status", "rejected")
        .returns<TaskRowData[]>()
    : { data: [] as TaskRowData[] };

  const sorted = [...(tasks ?? [])].sort((a, b) => {
    if (sort === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (sort === "project") return (a.project_id ?? 0) - (b.project_id ?? 0);
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return aDue - bDue;
  });

  function href(nextSort: string, nextProject: string) {
    const params = new URLSearchParams();
    if (nextSort) params.set("sort", nextSort);
    if (nextProject) params.set("project", nextProject);
    const qs = params.toString();
    return qs ? `/tasks?${qs}` : "/tasks";
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-navy-deep">タスク一覧</h1>
        <Link
          href="/plan"
          className="rounded-[10px] bg-gradient-to-r from-plum to-orchid px-4 py-2 text-xs font-bold text-white"
        >
          おすすめ計画を見る →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted">並び替え:</span>
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={href(s.key, project)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                sort === s.key ? "bg-navy-deep text-gold" : "bg-line/60 text-navy"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted">プロジェクト:</span>
          <Link
            href={href(sort, "")}
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
              project === "" ? "bg-navy-deep text-gold" : "bg-line/60 text-navy"
            }`}
          >
            すべて
          </Link>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={href(sort, String(p.id))}
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                project === String(p.id) ? "bg-navy-deep text-gold" : "bg-line/60 text-navy"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-[18px] bg-surface p-4 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
        {sorted.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">タスクがありません。</p>
        ) : (
          <div className="flex flex-col gap-1">
            {sorted.map((t) => (
              <TaskRow
                key={t.id}
                projectId={t.project_id}
                projectName={projectNameById.get(t.project_id)}
                taskId={t.id}
                title={t.title}
                progressComment={t.progress_comment}
                priority={t.priority}
                assignee={t.profiles?.display_name || t.profiles?.email || "―"}
                dueDate={t.due_date}
                estimatedHours={t.estimated_hours}
                status={t.status}
                source={t.source}
                sourceUrl={t.source_url}
                approvalStatus={t.approval_status}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
