import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { addTask, updateProjectSettings } from "@/app/actions";
import ProjectCredentialsBox from "./project-credentials-box";
import TaskRow from "./task-row";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);

  const { supabase, user } = await getCurrentUserOrRedirect();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound(); // RLSでメンバー外なら selectが0件になり、ここに来る

  type Profile = { display_name: string | null; email: string };
  type MemberRow = { user_id: string; role: string; profiles: Profile | null };
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
    profiles: Profile | null;
  };

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role, profiles(display_name, email)")
    .eq("project_id", projectId)
    .returns<MemberRow[]>();

  const isOwner = (members ?? []).some((m) => m.user_id === user.id && m.role === "owner");

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, progress_comment, priority, due_date, estimated_hours, status, source, source_url, approval_status, profiles(display_name, email)",
    )
    .eq("project_id", projectId)
    .neq("approval_status", "rejected") // 却下済みは一覧から隠す
    .order("due_date")
    .returns<TaskRowData[]>();

  const done = (tasks ?? []).filter((t) => t.status === "完了").length;
  const total = tasks?.length ?? 0;

  const addTaskWithId = addTask.bind(null, projectId);
  const updateSettingsWithId = updateProjectSettings.bind(null, projectId);

  return (
    <div className="-m-6 pb-14 lg:-m-10">
      <div className="relative overflow-hidden rounded-b-[28px] bg-gradient-to-br from-navy-deep via-navy via-40% to-blush px-8 pb-8 pt-6">
        <div className="pointer-events-none absolute -right-10 -top-14 h-56 w-56 rounded-full bg-gold opacity-15" />
        <Link href="/projects" className="relative text-sm font-bold text-white/85">
          ← プロジェクト一覧
        </Link>
        <div className="relative mt-2 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-white">{project.name}</h1>
          <span className="rounded-full bg-gold px-4 py-1.5 text-[11.5px] font-bold tracking-wide text-navy-deep">
            {project.status}
          </span>
        </div>
        <p className="relative mt-1 text-sm font-medium text-white/85">
          {project.summary || "(概要が未入力です)"}
        </p>
        <div className="relative mt-3 flex flex-wrap items-center gap-3">
          <ProjectCredentialsBox id={project.id} password={project.password} />
        </div>
        <p className="relative mt-1 text-[11.5px] font-semibold text-white/65">
          通知先チャンネルID：{project.slack_channel || "(未設定)"}
        </p>
      </div>

      <div className="px-8">
        {isOwner && (
          <details className="mb-6 mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-muted underline">
              概要・通知先チャンネルを編集
            </summary>
            <form action={updateSettingsWithId} className="mt-2 flex flex-col gap-2">
              <textarea
                name="summary"
                defaultValue={project.summary ?? ""}
                placeholder="概要(Botが答えるときに使います)"
                className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
                rows={2}
              />
              <input
                name="slack_channel"
                defaultValue={project.slack_channel ?? ""}
                placeholder="通知先チャンネルID(例: C0BRR3Z3A7R)"
                className="rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
              />
              <p className="text-xs text-muted">
                チャンネル名(#general)ではなくチャンネルIDが必要です。Slackでチャンネルを開き、
                チャンネル名をクリックすると詳細パネルの一番下にIDが表示されます。
              </p>
              <button className="self-start rounded-[10px] bg-navy-deep px-5 py-2.5 text-sm font-bold text-gold">
                保存する
              </button>
            </form>
          </details>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="rounded-[18px] bg-surface p-5 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-[15px] font-bold text-navy-deep">進み具合</span>
                <span className="text-sm font-bold text-navy">
                  {done} / {total} 件 完了
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-navy to-blush transition-all"
                  style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
                />
              </div>
            </div>

            <div className="rounded-[18px] bg-surface p-5 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
              <h2 className="mb-2 font-display text-[15px] font-bold text-navy-deep">タスク一覧</h2>
              <div className="flex flex-col gap-1">
                {(tasks ?? []).map((t) => (
                  <TaskRow
                    key={t.id}
                    projectId={projectId}
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

              <p className="mt-3.5 border-t border-dashed border-line pt-3.5 text-[11px] text-muted">
                Slackで通知先チャンネルにメッセージがきたら「📝」（memo）のリアクションを付けると、
                AIが要約して承認待ちタスクとして自動起票します。
              </p>
              <form action={addTaskWithId} className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  name="title"
                  placeholder="タスク名"
                  required
                  className="min-w-[140px] flex-1 rounded-[10px] border border-line px-3 py-2 text-sm"
                />
                <select name="priority" defaultValue="中" className="rounded-[10px] border border-line px-3 py-2 text-sm text-muted">
                  <option value="高">高</option>
                  <option value="中">中</option>
                  <option value="低">低</option>
                </select>
                <select
                  name="assignee_id"
                  className="rounded-[10px] border border-line px-3 py-2 text-sm text-muted"
                >
                  <option value="">(未割当)</option>
                  {(members ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.display_name || m.profiles?.email}
                    </option>
                  ))}
                </select>
                <input
                  name="due_date"
                  type="date"
                  title="しめきり日"
                  className="rounded-[10px] border border-line px-3 py-2 text-sm text-muted"
                />
                <input
                  name="estimated_hours"
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="かかる時間(h)"
                  className="w-28 rounded-[10px] border border-line px-3 py-2 text-sm text-muted"
                />
                <button className="rounded-[10px] bg-gradient-to-r from-navy-deep to-navy px-4 py-2 text-sm font-bold text-gold">
                  追加
                </button>
              </form>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="rounded-[18px] bg-surface p-5 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
              <h2 className="mb-3 font-display text-[15px] font-bold text-navy-deep">メンバー</h2>
              <ul className="mb-1 flex flex-col gap-2.5">
                {(members ?? []).map((m) => {
                  const label = m.profiles?.display_name || m.profiles?.email || "";
                  return (
                    <li key={m.user_id} className="flex items-center gap-2.5 text-sm">
                      <span className="flex h-[31px] w-[31px] items-center justify-center rounded-full bg-gradient-to-br from-teal to-blush text-[12.5px] font-bold text-white">
                        {label.slice(0, 1)}
                      </span>
                      <span className="flex-1 font-semibold text-ink">{label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-wide ${
                          m.role === "owner"
                            ? "bg-gold text-navy-deep"
                            : "bg-line text-muted"
                        }`}
                      >
                        {m.role}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 border-t border-dashed border-line pt-3 text-xs text-muted">
                上の「番号」と「パスワード」を伝えると、プロジェクト一覧画面から誰でも参加できます。
              </p>
            </div>

            <Link
              href={`/plan?scope=${projectId}&mode=now`}
              className="block rounded-[18px] bg-gradient-to-br from-plum to-orchid p-5 transition hover:opacity-90"
            >
              <h2 className="font-display text-[13.5px] font-bold text-white">AIおすすめ計画を見る →</h2>
              <p className="mt-1 text-xs font-medium text-white/90">
                締切と優先度から、このプロジェクトの理想の進め方を提案します。
              </p>
            </Link>

            <div className="rounded-[18px] bg-gradient-to-br from-navy to-indigo p-5">
              <h2 className="font-display text-[13.5px] font-bold text-white">Botに聞いてみよう</h2>
              <p className="mt-1 text-xs font-medium text-white/90">
                Slackで「@bot {project.name}どう？」と聞くと進捗を教えてくれます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
