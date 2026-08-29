import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import AppNav from "@/app/components/app-nav";

type ProjectRow = { id: number; name: string };
type TaskRow = {
  id: number;
  title: string;
  due_date: string | null;
  status: string;
  priority: string;
  project_id: number;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default async function HomePage() {
  const { supabase, displayName } = await getCurrentUserOrRedirect();

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

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  const todayKey = toDateKey(year, month, today.getDate());

  const { data: tasks } = projectIds.length
    ? await supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, project_id")
        .in("project_id", projectIds)
        .neq("approval_status", "rejected")
        .not("due_date", "is", null)
        .returns<TaskRow[]>()
    : { data: [] as TaskRow[] };

  const tasksByDate = new Map<string, TaskRow[]>();
  for (const t of tasks ?? []) {
    if (!t.due_date) continue;
    const list = tasksByDate.get(t.due_date) ?? [];
    list.push(t);
    tasksByDate.set(t.due_date, list);
  }

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstOfMonth.getDay(); // 0=日

  const cells: { day: number | null; key: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, key: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: toDateKey(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ day: null, key: null });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <AppNav active="calendar" displayName={displayName} />

      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col gap-3 rounded-[18px] bg-surface p-4 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)] md:h-fit">
          <h2 className="font-display text-[13px] font-bold text-navy-deep">プロジェクト</h2>
          {projects.length === 0 ? (
            <p className="text-xs text-muted">まだ参加しているプロジェクトがありません。</p>
          ) : (
            <ul className="flex flex-col gap-1">
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
          <Link
            href="/projects"
            className="mt-1 rounded-[10px] border border-dashed border-line px-3 py-2 text-center text-xs font-bold text-navy hover:bg-line/30"
          >
            ＋ 追加・一覧を見る
          </Link>
        </aside>

        <div className="rounded-[18px] bg-surface p-5 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-navy-deep">
              {year}年{month + 1}月
            </h2>
            <span className="text-xs font-semibold text-muted">期限の視覚表示</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-bold text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) => {
              const items = c.key ? tasksByDate.get(c.key) ?? [] : [];
              const isToday = c.key === todayKey;
              return (
                <div
                  key={i}
                  className={`min-h-[74px] rounded-[10px] border p-1.5 text-left ${
                    c.day === null
                      ? "border-transparent"
                      : isToday
                        ? "border-navy-deep bg-navy/5"
                        : "border-line"
                  }`}
                >
                  {c.day !== null && (
                    <>
                      <span className={`text-[10.5px] font-bold ${isToday ? "text-navy-deep" : "text-muted"}`}>
                        {c.day}
                      </span>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {items.slice(0, 3).map((t) => (
                          <Link
                            key={t.id}
                            href={`/project/${t.project_id}/task/${t.id}`}
                            title={t.title}
                            className={`truncate rounded px-1 py-0.5 text-[9.5px] font-bold ${
                              t.priority === "高"
                                ? "bg-blush/25 text-blush"
                                : "bg-gold/25 text-navy-deep"
                            }`}
                          >
                            {t.title}
                          </Link>
                        ))}
                        {items.length > 3 && (
                          <span className="text-[9px] text-muted">+{items.length - 3}件</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
