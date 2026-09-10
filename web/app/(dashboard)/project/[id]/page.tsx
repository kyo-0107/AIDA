import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { addTask, updateProjectSettings } from "@/app/actions";
import ProjectCredentialsBox from "./project-credentials-box";
import TaskRow from "./task-row";
import TeamsChannelPicker from "./teams-channel-picker";
import OutlookFolderPicker from "./outlook-folder-picker";
import GmailFilterPicker from "./gmail-filter-picker";
import DeadlineExtensionPanel, { type ExtensionCandidate } from "./deadline-extension-panel";
import EstimateHoursField from "@/app/components/estimate-hours-field";
import PrioritySelectField from "@/app/components/priority-select-field";

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
  type MemberRow = { user_id: string; role: string; profiles: (Profile & { paid_leave_total: number | null }) | null };
  type TaskRowData = {
    id: number;
    title: string;
    progress_comment: string | null;
    extracted_intent: string | null;
    requester: string | null;
    priority: string;
    due_date: string | null;
    estimated_hours: number | null;
    status: string;
    source: string;
    source_url: string | null;
    approval_status: "pending" | "approved" | "rejected";
    assignee_id: string | null;
    profiles: Profile | null;
  };

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role, profiles(display_name, email, paid_leave_total)")
    .eq("project_id", projectId)
    .returns<MemberRow[]>();

  // 責任者はプロジェクトを作成した人(projects.owner_id)のみ。project_members.role の
  // "owner" 表示はメンバー一覧用のラベルに過ぎず、権限判定には使わない。
  const isOwner = project.owner_id === user.id;

  // 有給休暇の紹介: メンバーごとの残り日数(付与日数 - 登録済みの休み予定日数)を計算する
  const memberIds = (members ?? []).map((m) => m.user_id);
  const { data: leaveDayRows } = memberIds.length
    ? await supabase.from("leave_days").select("user_id").in("user_id", memberIds)
    : { data: [] as { user_id: string }[] };
  const usedLeaveDaysByUser = new Map<string, number>();
  for (const row of leaveDayRows ?? []) {
    usedLeaveDaysByUser.set(row.user_id, (usedLeaveDaysByUser.get(row.user_id) ?? 0) + 1);
  }

  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, title, progress_comment, extracted_intent, requester, priority, due_date, estimated_hours, status, source, source_url, approval_status, assignee_id, profiles(display_name, email)",
    )
    .eq("project_id", projectId)
    .eq("approval_status", "approved") // 他ツール検知の承認待ちタスクはここには出さず、/tasks で横断確認する
    .order("due_date")
    .returns<TaskRowData[]>();

  const done = (tasks ?? []).filter((t) => t.status === "完了").length;
  const total = tasks?.length ?? 0;

  // メンバーごとのタスク・負荷が見えるように、担当者別に未完了タスクをまとめる
  const activeTasksByAssignee = new Map<string, TaskRowData[]>();
  for (const t of tasks ?? []) {
    if (t.status === "完了" || !t.assignee_id) continue;
    const list = activeTasksByAssignee.get(t.assignee_id) ?? [];
    list.push(t);
    activeTasksByAssignee.set(t.assignee_id, list);
  }

  const { data: integrations } = await supabase
    .from("project_integrations")
    .select("provider, channel_name, sender_filter, enabled")
    .eq("project_id", projectId);

  const teamsIntegration = (integrations ?? []).find((i) => i.provider === "teams") ?? null;
  const outlookIntegration = (integrations ?? []).find((i) => i.provider === "outlook") ?? null;
  const gmailIntegration = (integrations ?? []).find((i) => i.provider === "gmail") ?? null;

  let gmailConnected = false;
  if (isOwner) {
    const { data: gmailAccount } = await supabase
      .from("user_integrations")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .maybeSingle();
    gmailConnected = Boolean(gmailAccount);
  }

  let extensionCandidates: ExtensionCandidate[] = [];
  if (isOwner) {
    type ExtensionRow = {
      id: number;
      title: string;
      due_date: string | null;
      requested_due_date: string | null;
      progress_comment: string | null;
      profiles: Profile | null;
    };
    const { data: extensionRows } = await supabase
      .from("tasks")
      .select("id, title, due_date, requested_due_date, progress_comment, profiles(display_name, email)")
      .eq("project_id", projectId)
      .neq("status", "完了")
      .not("requested_due_date", "is", null)
      .returns<ExtensionRow[]>();
    extensionCandidates = (extensionRows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      due_date: r.due_date,
      requested_due_date: r.requested_due_date as string,
      progress_comment: r.progress_comment,
      assignee: r.profiles?.display_name || r.profiles?.email || "(未割当)",
    }));
  }

  const addTaskWithId = addTask.bind(null, projectId);
  const updateSettingsWithId = updateProjectSettings.bind(null, projectId);

  return (
    <div className="-mx-6 pb-14 lg:-mx-10">
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-navy-deep via-navy via-40% to-blush px-8 pb-8 pt-6">
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

        {isOwner ? (
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <TeamsChannelPicker projectId={projectId} current={teamsIntegration ?? null} />
            <OutlookFolderPicker projectId={projectId} current={outlookIntegration ?? null} />
            <GmailFilterPicker projectId={projectId} current={gmailIntegration ?? null} connected={gmailConnected} />
          </div>
        ) : (
          (teamsIntegration || outlookIntegration || gmailIntegration) && (
            <div className="mb-6 flex flex-col gap-1 text-xs text-muted">
              {teamsIntegration && (
                <p>Microsoft Teams連携: {teamsIntegration.channel_name}（{teamsIntegration.enabled ? "有効" : "無効"}）</p>
              )}
              {outlookIntegration && (
                <p>Outlook連携: {outlookIntegration.channel_name}（{outlookIntegration.enabled ? "有効" : "無効"}）</p>
              )}
              {gmailIntegration && (
                <p>Gmail連携: {gmailIntegration.sender_filter || "全件対象"}（{gmailIntegration.enabled ? "有効" : "無効"}）</p>
              )}
            </div>
          )
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-5">
            {isOwner && <DeadlineExtensionPanel projectId={projectId} tasks={extensionCandidates} />}

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
                    extractedIntent={t.extracted_intent}
                    requester={t.requester}
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
                AIが要約して承認待ちタスクとして自動起票します(Teams/Outlook/Gmailも同様に自動検知)。
                承認待ちのタスクはこのプロジェクト画面ではなく、
                <Link href="/tasks" className="font-bold text-indigo underline">
                  タスク一覧
                </Link>
                でまとめて確認・承認できます。
              </p>
              <form action={addTaskWithId} className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  name="title"
                  placeholder="タスク名"
                  required
                  className="min-w-[140px] flex-1 rounded-[10px] border border-line px-3 py-2 text-sm"
                />
                <PrioritySelectField className="flex items-center gap-1.5" />
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
                  name="requester"
                  placeholder="依頼元(任意)"
                  title="依頼元(クライアント名など。優先度提案の判断材料になります)"
                  className="w-28 rounded-[10px] border border-line px-3 py-2 text-sm text-muted"
                />
                <EstimateHoursField className="flex items-center gap-1.5" />
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
                  const paidLeaveTotal = m.profiles?.paid_leave_total ?? null;
                  const remainingLeaveDays =
                    paidLeaveTotal != null ? paidLeaveTotal - (usedLeaveDaysByUser.get(m.user_id) ?? 0) : null;
                  const activeTasks = activeTasksByAssignee.get(m.user_id) ?? [];
                  const totalHours = activeTasks.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0);
                  return (
                    <li key={m.user_id} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2.5 text-sm">
                        <span className="flex h-[31px] w-[31px] items-center justify-center rounded-full bg-gradient-to-br from-teal to-blush text-[12.5px] font-bold text-white">
                          {label.slice(0, 1)}
                        </span>
                        <span className="flex-1 font-semibold text-ink">{label}</span>
                        {remainingLeaveDays != null && (
                          <span className="rounded-full bg-sage/40 px-2.5 py-1 text-[9.5px] font-bold text-navy-deep">
                            有給残り{remainingLeaveDays}日
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2.5 py-1 text-[9.5px] font-bold tracking-wide ${
                            m.role === "owner"
                              ? "bg-gold text-navy-deep"
                              : "bg-line text-muted"
                          }`}
                        >
                          {m.role}
                        </span>
                      </div>
                      {activeTasks.length > 0 && (
                        <div className="ml-10 flex flex-wrap items-center gap-1.5">
                          <span className="whitespace-nowrap rounded-full bg-navy/10 px-2 py-0.5 text-[9.5px] font-bold text-navy">
                            対応中 {activeTasks.length}件・{totalHours}h
                          </span>
                          {activeTasks.slice(0, 3).map((t) => (
                            <Link
                              key={t.id}
                              href={`/project/${projectId}/task/${t.id}`}
                              className="max-w-[140px] truncate rounded-full bg-line/60 px-2 py-0.5 text-[9.5px] font-semibold text-muted hover:text-navy"
                            >
                              {t.title}
                            </Link>
                          ))}
                          {activeTasks.length > 3 && (
                            <span className="text-[9.5px] font-semibold text-muted">
                              +{activeTasks.length - 3}件
                            </span>
                          )}
                        </div>
                      )}
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
