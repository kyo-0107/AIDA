"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { suggestStartDate, type PlanTask } from "@/lib/plan";
import { extractIntent } from "@/lib/intent-extraction";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です。");
  return { supabase, user };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await requireUser();

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) throw new Error("表示名を入力してください。");

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/");
}

// ── 有給休暇の紹介 ───────────────────────────────
export async function updatePaidLeaveTotal(formData: FormData) {
  const { supabase, user } = await requireUser();

  const raw = String(formData.get("paid_leave_total") ?? "").trim();
  const paidLeaveTotal = raw ? Number(raw) : null;
  if (raw && (Number.isNaN(paidLeaveTotal) || paidLeaveTotal! < 0)) {
    throw new Error("有給の付与日数は0以上の数値で入力してください。");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ paid_leave_total: paidLeaveTotal })
    .eq("id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/projects");
}

export async function addLeaveDay(formData: FormData) {
  const { supabase, user } = await requireUser();

  const date = String(formData.get("date") ?? "").trim();
  if (!date) throw new Error("休み予定日を入力してください。");

  const { error } = await supabase
    .from("leave_days")
    .upsert({ user_id: user.id, date }, { onConflict: "user_id,date" });
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/projects");
}

export async function deleteLeaveDay(leaveDayId: number) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("leave_days")
    .delete()
    .eq("id", leaveDayId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/projects");
}

export async function disconnectTeams() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "teams");
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}

export async function setProjectTeamsChannel(projectId: number, formData: FormData) {
  const { supabase, user } = await requireUser();

  const teamId = String(formData.get("team_id") ?? "").trim();
  const teamName = String(formData.get("team_name") ?? "").trim();
  const channelId = String(formData.get("channel_id") ?? "").trim();
  const channelName = String(formData.get("channel_name") ?? "").trim();
  if (!teamId || !channelId) throw new Error("チームとチャンネルを選択してください。");

  // メンバー各自が自分のアカウントで有効化する(検知したタスクは本人に自動で担当付けされる)
  const { error } = await supabase.from("project_integrations").upsert(
    {
      project_id: projectId,
      provider: "teams",
      user_id: user.id,
      external_team_id: teamId,
      external_channel_id: channelId,
      channel_name: `${teamName} / ${channelName}`,
      enabled: true,
    },
    { onConflict: "project_id,provider,user_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function disconnectOutlook() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "outlook");
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}

export async function setProjectOutlookFolder(projectId: number, formData: FormData) {
  const { supabase, user } = await requireUser();

  const folderId = String(formData.get("folder_id") ?? "").trim();
  const folderName = String(formData.get("folder_name") ?? "").trim();
  if (!folderId) throw new Error("フォルダを選択してください。");

  // メンバー各自が自分のアカウントで有効化する(検知したタスクは本人に自動で担当付けされる)
  const { error } = await supabase.from("project_integrations").upsert(
    {
      project_id: projectId,
      provider: "outlook",
      user_id: user.id,
      external_channel_id: folderId,
      channel_name: folderName,
      enabled: true,
    },
    { onConflict: "project_id,provider,user_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function toggleProjectIntegration(projectId: number, provider: string, enabled: boolean) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("project_integrations")
    .update({ enabled })
    .eq("project_id", projectId)
    .eq("provider", provider)
    .eq("user_id", user.id); // 自分の行だけを切り替える
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const summary = String(formData.get("summary") ?? "");
  const password = String(formData.get("password") ?? "").trim();
  const slackChannel = String(formData.get("slack_channel") ?? "").trim() || null;
  if (!name) throw new Error("プロジェクト名を入力してください。");
  if (!password) throw new Error("参加パスワードを入力してください。");

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      name,
      summary,
      password,
      owner_id: user.id,
      slack_channel: slackChannel,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from("project_members")
    .insert({ project_id: project.id, user_id: user.id, role: "owner" });

  revalidatePath("/");
  revalidatePath("/projects");
}

export async function joinProject(formData: FormData) {
  const { supabase } = await requireUser();

  const idRaw = String(formData.get("project_id") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const id = Number(idRaw);
  if (!idRaw || Number.isNaN(id)) throw new Error("プロジェクト番号を入力してください。");
  if (!password) throw new Error("パスワードを入力してください。");

  const { error } = await supabase.rpc("join_project_by_credentials", {
    p_id: id,
    p_password: password,
  });
  if (error) throw new Error("参加できませんでした。プロジェクト番号とパスワードを確認してください。");

  revalidatePath("/");
  revalidatePath("/projects");
}

export async function updateProjectSettings(projectId: number, formData: FormData) {
  const { supabase } = await requireUser();

  const summary = String(formData.get("summary") ?? "");
  const slackChannel = String(formData.get("slack_channel") ?? "").trim() || null;

  const { error } = await supabase
    .from("projects")
    .update({ summary, slack_channel: slackChannel })
    .eq("id", projectId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function addTask(projectId: number, formData: FormData) {
  const { supabase } = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = String(formData.get("assignee_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const priority = String(formData.get("priority") ?? "中");
  const estimatedHoursRaw = String(formData.get("estimated_hours") ?? "").trim();
  const requester = String(formData.get("requester") ?? "").trim() || null;
  if (!title) throw new Error("タスク名を入力してください。");

  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    title,
    assignee_id: assigneeId,
    due_date: dueDate,
    priority,
    estimated_hours: estimatedHoursRaw ? Number(estimatedHoursRaw) : null,
    requester,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function updateTaskDetails(projectId: number, taskId: number, formData: FormData) {
  const { supabase, user } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  const isOwner = project?.owner_id === user.id;

  const title = String(formData.get("title") ?? "").trim();
  const progressComment = String(formData.get("progress_comment") ?? "") || null;
  const priority = String(formData.get("priority") ?? "中");
  const assigneeId = String(formData.get("assignee_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const estimatedHoursRaw = String(formData.get("estimated_hours") ?? "").trim();
  const requester = String(formData.get("requester") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "未着手");
  const newProjectIdRaw = String(formData.get("project_id") ?? "").trim();
  const newProjectId = newProjectIdRaw ? Number(newProjectIdRaw) : projectId;
  if (!title) throw new Error("タスク名を入力してください。");

  // 保存のたびにAIへ意図を判定させる(F-202b)。分類ロジック自体を後で改善することがあるため、
  // 「コメントが変わっていなければスキップ」という最適化はせず、常に最新の判定結果で上書きする。
  let extractedIntent: string | null = null;
  let requestedDueDate: string | null = null;
  if (progressComment) {
    const result = await extractIntent(progressComment, new Date());
    extractedIntent = result.label;
    requestedDueDate = result.requestedDueDate;
  }

  const updatePayload: Record<string, unknown> = {
    title,
    progress_comment: progressComment,
    extracted_intent: extractedIntent,
    requested_due_date: requestedDueDate,
    priority,
    assignee_id: assigneeId,
    estimated_hours: estimatedHoursRaw ? Number(estimatedHoursRaw) : null,
    requester,
    status,
  };
  // 締切の変更(=延長)はプロジェクト責任者のみに許可する。責任者以外からの送信は
  // フォームが無効化されているはずだが、サーバー側でも念のため無視する。
  if (isOwner) {
    updatePayload.due_date = dueDate;
  }
  // 所属プロジェクトの変更(project_members RLSにより、自分が参加していないプロジェクトへは移動できない)
  if (newProjectId !== projectId) {
    updatePayload.project_id = newProjectId;
  }

  const { error } = await supabase.from("tasks").update(updatePayload).eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}/task/${taskId}`);
  revalidatePath(`/project/${projectId}`);
  revalidatePath("/tasks");

  if (newProjectId !== projectId) {
    revalidatePath(`/project/${newProjectId}`);
    revalidatePath(`/project/${newProjectId}/task/${taskId}`);
    redirect(`/project/${newProjectId}/task/${taskId}`);
  }
}

// メンバーからの期限延長希望を受けて、プロジェクト責任者が実際に締切を延長する
export async function extendTaskDueDate(projectId: number, taskId: number, formData: FormData) {
  const { supabase, user } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.owner_id !== user.id) {
    throw new Error("プロジェクト責任者のみ締切を延長できます。");
  }

  const newDueDate = String(formData.get("new_due_date") ?? "").trim();
  if (!newDueDate) throw new Error("新しい締切日を入力してください。");

  // requested_due_date をクリアしないと、対応済みのタスクが「期限延長リクエスト」一覧に
  // 残り続け、ボタンが効いていないように見えてしまう。
  const { error } = await supabase
    .from("tasks")
    .update({ due_date: newDueDate, requested_due_date: null })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/task/${taskId}`);
}

export async function deleteTask(projectId: number, taskId: number) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
  redirect(`/project/${projectId}`);
}

export async function reviewTask(
  projectId: number,
  taskId: number,
  decision: "approved" | "rejected",
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("tasks")
    .update({ approval_status: decision })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/task/${taskId}`);
}

export async function toggleTaskStatus(projectId: number, taskId: number, done: boolean) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("tasks")
    .update({ status: done ? "完了" : "進行中" })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
  revalidatePath(`/project/${projectId}/task/${taskId}`);
}

// ── AIおすすめ計画(画面③): 着手日の提案を承認/却下する ──────
export async function applyPlanSuggestion(taskId: number, newStartDate: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("tasks")
    .update({ planned_start_date: newStartDate })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath("/plan");
  revalidatePath("/");
}

export async function applyAllPlanSuggestions(scopeProjectIds: number[]) {
  const { supabase } = await requireUser();

  const { data: tasks } = scopeProjectIds.length
    ? await supabase
        .from("tasks")
        .select("id, title, priority, due_date, estimated_hours, planned_start_date, project_id, extracted_intent, requested_due_date")
        .in("project_id", scopeProjectIds)
        .eq("approval_status", "approved")
        .neq("status", "完了")
        .returns<PlanTask[]>()
    : { data: [] as PlanTask[] };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const t of tasks ?? []) {
    const { suggestedStart } = suggestStartDate(t, today);
    if (suggestedStart && suggestedStart !== t.planned_start_date) {
      await supabase.from("tasks").update({ planned_start_date: suggestedStart }).eq("id", t.id);
    }
  }

  revalidatePath("/plan");
  revalidatePath("/");
}

// ── Gmail連携: Teams/Outlookと同じくユーザー単位で接続し(user_integrations)、
// プロジェクトごとの有効化・送信者フィルタは project_integrations で管理する ──
export async function disconnectGmail() {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", "gmail");
  if (error) throw new Error(error.message);

  revalidatePath("/profile");
}

export async function setProjectGmailFilter(projectId: number, formData: FormData) {
  const { supabase, user } = await requireUser();

  const senderFilter = String(formData.get("sender_filter") ?? "").trim() || null;

  // メンバー各自が自分のアカウントで有効化する(検知したタスクは本人に自動で担当付けされる)
  const { error } = await supabase.from("project_integrations").upsert(
    {
      project_id: projectId,
      provider: "gmail",
      user_id: user.id,
      sender_filter: senderFilter,
      enabled: true,
    },
    { onConflict: "project_id,provider,user_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}
