import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestDeadlineExtension, type OtherTask } from "@/lib/deadline-extension";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const taskId = Number(body?.taskId);
  if (!taskId) return NextResponse.json({ error: "taskIdが必要です" }, { status: 400 });

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, project_id, due_date, requested_due_date, progress_comment, assignee_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
  if (!task.requested_due_date) {
    return NextResponse.json({ error: "本人の希望期限が読み取れていません" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("owner_id, deadline")
    .eq("id", task.project_id)
    .maybeSingle();
  // 期限延長の可否判断はプロジェクト責任者だけに開放する
  if (!project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "プロジェクト責任者のみ利用できます" }, { status: 403 });
  }

  let otherTasks: OtherTask[] = [];
  let leaveDays: string[] = [];
  if (task.assignee_id) {
    const { data } = await supabase
      .from("tasks")
      .select("title, due_date, estimated_hours, status")
      .eq("project_id", task.project_id)
      .eq("assignee_id", task.assignee_id)
      .neq("id", taskId)
      .neq("status", "完了")
      .returns<OtherTask[]>();
    otherTasks = data ?? [];

    const { data: leaveRows } = await supabase
      .from("leave_days")
      .select("date")
      .eq("user_id", task.assignee_id)
      .gte("date", new Date().toISOString().slice(0, 10));
    leaveDays = (leaveRows ?? []).map((r) => r.date as string);
  }

  const result = await suggestDeadlineExtension(
    task.title,
    task.due_date,
    task.requested_due_date,
    task.progress_comment,
    project.deadline,
    otherTasks,
    leaveDays,
    new Date(),
  );
  if (!result) return NextResponse.json({ error: "提案の生成に失敗しました" }, { status: 500 });

  return NextResponse.json(result);
}
