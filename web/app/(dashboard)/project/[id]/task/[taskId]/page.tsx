import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/current-user";
import { deleteTask, reviewTask, updateTaskDetails } from "@/app/actions";
import EstimateHoursField from "@/app/components/estimate-hours-field";
import PrioritySelectField from "@/app/components/priority-select-field";

const PRIORITY_STYLE: Record<string, string> = {
  高: "bg-blush/20 text-blush",
  中: "bg-gold/25 text-navy-deep",
  低: "bg-line text-muted",
};

const SOURCE_LABEL: Record<string, string> = {
  slack: "Slack",
  teams: "Teams",
  gmail: "Gmail",
  outlook: "Outlook",
  manual: "手動登録",
};

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const projectId = Number(id);
  const taskIdNum = Number(taskId);

  const { supabase, user } = await getCurrentUserOrRedirect();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) notFound(); // RLSでメンバー外なら0件になりここに来る
  const isOwner = project.owner_id === user.id;

  type Profile = { display_name: string | null; email: string };
  type TaskDetail = {
    id: number;
    title: string;
    progress_comment: string | null;
    extracted_intent: string | null;
    requested_due_date: string | null;
    requester: string | null;
    priority: string;
    due_date: string | null;
    estimated_hours: number | null;
    status: string;
    created_at: string;
    source: string;
    source_url: string | null;
    approval_status: "pending" | "approved" | "rejected";
    assignee_id: string | null;
    profiles: Profile | null;
  };

  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, title, progress_comment, extracted_intent, requested_due_date, requester, priority, due_date, estimated_hours, status, created_at, source, source_url, approval_status, assignee_id, profiles(display_name, email)",
    )
    .eq("id", taskIdNum)
    .eq("project_id", projectId)
    .maybeSingle<TaskDetail>();
  if (!task) notFound();

  type MemberRow = { user_id: string; profiles: Profile | null };
  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, profiles(display_name, email)")
    .eq("project_id", projectId)
    .returns<MemberRow[]>();

  // 帰属プロジェクトの変更先候補として、自分が参加している全プロジェクトを取得
  type MyProject = { id: number; name: string };
  type MembershipRow = { projects: MyProject | null };
  const { data: membershipRows } = await supabase
    .from("project_members")
    .select("projects(id, name)")
    .eq("user_id", user.id) // 自分の参加分だけ(RLSは同じプロジェクトの他メンバーの行も見えてしまうため)
    .returns<MembershipRow[]>();
  const myProjects = (membershipRows ?? [])
    .map((r) => r.projects)
    .filter((p): p is MyProject => Boolean(p));

  const updateWithIds = updateTaskDetails.bind(null, projectId, taskIdNum);
  const deleteWithIds = deleteTask.bind(null, projectId, taskIdNum);
  const awaitingReview = task.approval_status === "pending";
  const createdAt = new Date(task.created_at).toLocaleDateString("ja-JP");

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/project/${projectId}`} className="text-sm font-bold text-navy">
        ← {project.name} に戻る
      </Link>

      <div className="mt-4 rounded-[20px] bg-surface p-6 shadow-[0_10px_24px_-14px_oklch(28%_0.09_275_/_0.2)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE["中"]}`}>
              優先度: {task.priority}
            </span>
            {task.requester && (
              <span className="rounded-full bg-plum/15 px-2.5 py-1 text-[10.5px] font-bold text-plum">
                依頼元: {task.requester}
              </span>
            )}
            {task.source !== "manual" && (
              <span className="rounded-full bg-navy/10 px-2.5 py-1 text-[10.5px] font-bold text-navy">
                情報元: {SOURCE_LABEL[task.source] ?? task.source}
              </span>
            )}
            {awaitingReview && (
              <span className="rounded-full bg-gold px-2.5 py-1 text-[10.5px] font-bold text-navy-deep">
                承認待ち
              </span>
            )}
            {task.approval_status === "rejected" && (
              <span className="rounded-full bg-line px-2.5 py-1 text-[10.5px] font-bold text-muted">
                却下済み
              </span>
            )}
          </div>
          <form action={deleteWithIds}>
            <button className="rounded-full border border-line px-2.5 py-1 text-[10.5px] font-bold text-muted hover:bg-blush/10 hover:text-blush">
              ✕ 削除
            </button>
          </form>
        </div>

        <h1 className="font-display text-2xl font-bold text-ink">{task.title}</h1>
        <p className="mt-1 text-xs font-semibold text-muted">
          作成日: {createdAt} ／ プロジェクト: {project.name}
        </p>

        {task.source_url && (
          <a
            href={task.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-bold text-indigo underline"
          >
            情報元(Slackスレッド)を見る ↗
          </a>
        )}

        {awaitingReview && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-gold/10 p-3">
            <p className="flex-1 text-xs font-semibold text-navy-deep">
              AIが自動で起票した下書きのタスクです。内容を確認したうえで、承認するか判断してください。
            </p>
            <form action={reviewTask.bind(null, projectId, taskIdNum, "approved")}>
              <button className="rounded-[8px] bg-navy-deep px-3.5 py-1.5 text-[11px] font-bold text-gold">
                承認する
              </button>
            </form>
            <form action={reviewTask.bind(null, projectId, taskIdNum, "rejected")}>
              <button className="rounded-[8px] border border-line px-3.5 py-1.5 text-[11px] font-bold text-muted">
                却下する
              </button>
            </form>
          </div>
        )}

        <hr className="my-6 border-dashed border-line" />

        <h2 className="mb-3 font-display text-[15px] font-bold text-navy-deep">タスクの編集</h2>
        <form action={updateWithIds} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-muted">タスク名</label>
            <input
              name="title"
              defaultValue={task.title}
              required
              className="w-full rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted">所属プロジェクト</label>
            <select
              name="project_id"
              defaultValue={String(projectId)}
              className="w-full rounded-[10px] border border-line px-3 py-2 text-sm"
            >
              {myProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10.5px] text-muted">
              他ツールからの自動検知などで違うプロジェクトに登録されてしまった場合、ここで移動できます。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">担当者</label>
              <select
                name="assignee_id"
                defaultValue={task.assignee_id ?? ""}
                className="w-full rounded-[10px] border border-line px-3 py-2 text-sm"
              >
                <option value="">(未割当)</option>
                {(members ?? []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles?.display_name || m.profiles?.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-muted">進捗状況</label>
              <select
                name="status"
                defaultValue={task.status}
                disabled={awaitingReview}
                className="w-full rounded-[10px] border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                <option value="未着手">未着手</option>
                <option value="進行中">進行中</option>
                <option value="完了">完了</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-muted">しめきり日</label>
              <input
                name="due_date"
                type="date"
                defaultValue={task.due_date ?? ""}
                disabled={!isOwner}
                className="w-full rounded-[10px] border border-line px-3 py-2 text-sm disabled:opacity-40"
              />
              {!isOwner && (
                <p className="mt-1 text-[10.5px] text-muted">
                  締切の変更(延長)はプロジェクト責任者のみ行えます。延長してほしい場合は下の「このタスクに関する意見」に書いてください。
                </p>
              )}
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-muted">かかる時間(h)</label>
              <EstimateHoursField defaultValue={task.estimated_hours} />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-muted">依頼元</label>
              <input
                name="requester"
                defaultValue={task.requester ?? ""}
                placeholder="クライアント名など(任意)"
                className="w-full rounded-[10px] border border-line px-3 py-2 text-sm"
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-xs font-bold text-muted">優先度</label>
              <PrioritySelectField defaultValue={task.priority} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-muted">このタスクに関する意見</label>
            <textarea
              name="progress_comment"
              defaultValue={task.progress_comment ?? ""}
              rows={4}
              placeholder="例: 自信がないので誰かからフォローが欲しい／余裕がないので期限を伸ばしてほしい"
              className="w-full rounded-[10px] border border-line px-3.5 py-2.5 text-sm"
            />
            {task.extracted_intent && (
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-plum/15 px-2.5 py-1 text-[10.5px] font-bold text-plum">
                  AIが読み取った意図: {task.extracted_intent}
                </span>
                {task.requested_due_date && (
                  <span className="rounded-full bg-gold/25 px-2.5 py-1 text-[10.5px] font-bold text-navy-deep">
                    希望期限: {task.requested_due_date}
                  </span>
                )}
              </p>
            )}
            <p className="mt-1 text-[10.5px] text-muted">
              ここに書いた内容はAIが読み取り、フォロー要請・期限延長希望などをAIおすすめ計画の判断材料として使います
              （保存すると再判定されます）。
            </p>
          </div>

          <button className="self-start rounded-[10px] bg-navy-deep px-5 py-2.5 text-sm font-bold text-gold">
            保存する
          </button>
        </form>
      </div>
    </div>
  );
}
