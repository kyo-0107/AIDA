"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { suggestStartDate, type PlanTask } from "@/lib/plan";

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
  if (!title) throw new Error("タスク名を入力してください。");

  const { error } = await supabase.from("tasks").insert({
    project_id: projectId,
    title,
    assignee_id: assigneeId,
    due_date: dueDate,
    priority,
    estimated_hours: estimatedHoursRaw ? Number(estimatedHoursRaw) : null,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}`);
}

export async function updateTaskDetails(projectId: number, taskId: number, formData: FormData) {
  const { supabase } = await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const progressComment = String(formData.get("progress_comment") ?? "") || null;
  const priority = String(formData.get("priority") ?? "中");
  const assigneeId = String(formData.get("assignee_id") ?? "") || null;
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const estimatedHoursRaw = String(formData.get("estimated_hours") ?? "").trim();
  const status = String(formData.get("status") ?? "未着手");
  if (!title) throw new Error("タスク名を入力してください。");

  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      progress_comment: progressComment,
      priority,
      assignee_id: assigneeId,
      due_date: dueDate,
      estimated_hours: estimatedHoursRaw ? Number(estimatedHoursRaw) : null,
      status,
    })
    .eq("id", taskId);
  if (error) throw new Error(error.message);

  revalidatePath(`/project/${projectId}/task/${taskId}`);
  revalidatePath(`/project/${projectId}`);
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
        .select("id, title, priority, due_date, estimated_hours, planned_start_date, project_id")
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
