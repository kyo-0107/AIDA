import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";

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
  const { supabase, user } = await getCurrentUserOrRedirect();

  type MembershipRow = { projects: ProjectRow | null };
  const { data: rows } = await supabase
    .from("project_members")
    .select("projects(id, name)")
    .eq("user_id", user.id) // 自分の参加分だけ(RLSは同じプロジェクトの他メンバーの行も見えてしまうため)
    .returns<MembershipRow[]>();
  const projects = (rows ?? [])
    .map((r) => r.projects)
    .filter((p): p is ProjectRow => Boolean(p));
  const projectIds = projects.map((p) => p.id);

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
    <div className="flex h-full w-full flex-col rounded-[18px] bg-surface p-6 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-navy-deep">
          {year}年{month + 1}月
        </h2>
        <span className="text-xs font-semibold text-muted">期限の視覚表示</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          const items = c.key ? tasksByDate.get(c.key) ?? [] : [];
          const isToday = c.key === todayKey;
          return (
            <div
              key={i}
              className={`min-h-[104px] rounded-[10px] border p-2 text-left ${
                c.day === null
                  ? "border-transparent"
                  : isToday
                    ? "border-navy-deep bg-navy/5"
                    : "border-line"
              }`}
            >
              {c.day !== null && (
                <>
                  <span className={`text-xs font-bold ${isToday ? "text-navy-deep" : "text-muted"}`}>
                    {c.day}
                  </span>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {items.slice(0, 4).map((t) => (
                      <Link
                        key={t.id}
                        href={`/project/${t.project_id}/task/${t.id}`}
                        title={t.title}
                        className={`truncate rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                          t.priority === "高"
                            ? "bg-blush/25 text-blush"
                            : "bg-gold/25 text-navy-deep"
                        }`}
                      >
                        {t.title}
                      </Link>
                    ))}
                    {items.length > 4 && (
                      <span className="text-[10px] text-muted">+{items.length - 4}件</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
