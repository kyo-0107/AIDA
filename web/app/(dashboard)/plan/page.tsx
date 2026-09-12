import Link from "next/link";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { applyAllPlanSuggestions, applyPlanSuggestion } from "@/app/actions";
import { suggestStartDate, type PlanTask } from "@/lib/plan";

type ProjectRow = { id: number; name: string };

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; mode?: string }>;
}) {
  const { scope = "all", mode = "now" } = await searchParams;

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
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const scopedProjectIds =
    scope !== "all" && projectIds.includes(Number(scope)) ? [Number(scope)] : projectIds;

  const { data: tasks } = scopedProjectIds.length
    ? await supabase
        .from("tasks")
        .select("id, title, priority, due_date, estimated_hours, planned_start_date, project_id, extracted_intent, requested_due_date")
        .in("project_id", scopedProjectIds)
        .eq("approval_status", "approved")
        .neq("status", "完了")
        .order("due_date")
        .returns<PlanTask[]>()
    : { data: [] as PlanTask[] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rowsData = (tasks ?? []).map((t) => ({
    task: t,
    ...suggestStartDate(t, today),
  }));

  function href(nextScope: string, nextMode: string) {
    return `/plan?scope=${nextScope}&mode=${nextMode}`;
  }

  const applyAllForScope = applyAllPlanSuggestions.bind(null, scopedProjectIds);

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[20px] bg-gradient-to-br from-plum to-orchid p-6 text-white">
        <h1 className="font-display text-2xl font-bold">AIおすすめ計画</h1>
        <p className="mt-1 text-sm text-white/85">
          締切・優先度・かかる時間から、各タスクの「着手すべき日」を提案します。
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-white/80">再計算:</span>
          <Link
            href={href(scope, "now")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              mode === "now" ? "bg-gold text-navy-deep" : "bg-white/15 text-white"
            }`}
          >
            今すぐ再計算
          </Link>
          <Link
            href={href(scope, "daily")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              mode === "daily" ? "bg-gold text-navy-deep" : "bg-white/15 text-white"
            }`}
          >
            自動再計算（1回／日）
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-white/80">プロジェクト単位で考える:</span>
          <Link
            href={href("all", mode)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              scope === "all" ? "bg-gold text-navy-deep" : "bg-white/15 text-white"
            }`}
          >
            全プロジェクト横断
          </Link>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={href(String(p.id), mode)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                scope === String(p.id) ? "bg-gold text-navy-deep" : "bg-white/15 text-white"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>

        {mode === "daily" && (
          <p className="mt-3 text-[11px] text-white/70">
            ※自動再計算(1日1回)の裏側スケジューラーはまだ未実装です。今のところはこのページを開くたびに最新の状態で計算します。
          </p>
        )}

        {rowsData.length > 0 && (
          <form action={applyAllForScope} className="mt-4">
            <button className="rounded-[10px] bg-gold px-4 py-2 text-xs font-bold text-navy-deep">
              一括承認(表示中の提案をすべて反映)
            </button>
          </form>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-plum/20 bg-plum/10 px-4 py-3.5">
        <span className="text-xl leading-none">🧡</span>
        <div>
          <p className="text-[12.5px] font-bold text-plum">心情配慮スケジューリング</p>
          <p className="mt-1 text-xs text-navy-deep">
            締切・かかる時間・優先度に加えて、タスク詳細の「このタスクに関する意見」に書かれた
            フォロー要請・期限延長希望などをAIが読み取り、着手日の提案に反映しています。
          </p>
          <p className="mt-1.5 text-[10.5px] text-muted">
            ※AIによる下書きの提案です。内容を確認したうえで「承認して反映」を押してください。
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[18px] bg-surface shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-bold text-muted">
              <th className="px-4 py-3">タスク名</th>
              <th className="px-4 py-3">現在の着手日</th>
              <th className="px-4 py-3">提案する変更日</th>
              <th className="px-4 py-3">理由</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {rowsData.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                  対象のタスクはありません。
                </td>
              </tr>
            )}
            {rowsData.map(({ task, suggestedStart, reason }) => {
              const changed = suggestedStart && suggestedStart !== task.planned_start_date;
              return (
                <tr key={task.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/project/${task.project_id}/task/${task.id}`}
                      className="font-semibold text-ink hover:underline"
                    >
                      {task.title}
                    </Link>
                    <div className="text-[10.5px] text-muted">{projectNameById.get(task.project_id)}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{task.planned_start_date || "未設定"}</td>
                  <td className="px-4 py-3 font-bold text-navy">
                    {suggestedStart || "―"}
                    {changed && <span className="ml-1.5 rounded-full bg-blush/20 px-1.5 py-0.5 text-[9.5px] text-blush">変更あり</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {task.extracted_intent && (
                      <span className="mb-1 mr-1.5 inline-block rounded-full bg-plum/15 px-2 py-0.5 text-[9.5px] font-bold text-plum">
                        {task.extracted_intent}
                      </span>
                    )}
                    <div>{reason}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {suggestedStart && changed && (
                      <form action={applyPlanSuggestion.bind(null, task.id, suggestedStart)} className="inline">
                        <button className="rounded-[8px] bg-navy-deep px-3 py-1 text-[11px] font-bold text-gold">
                          承認して反映
                        </button>
                      </form>
                    )}
                    {suggestedStart && !changed && (
                      <span className="text-[10.5px] text-muted">反映済み</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
