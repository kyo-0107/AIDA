import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestEstimatedHours, type PastTask } from "@/lib/estimate";

// タスク追加/編集フォームの「AI提案」ボタンから呼ばれる。
// 担当者の過去実績はRLS経由(is_project_member)で取得するため、
// 呼び出したユーザーが実際に閲覧できる範囲のタスクだけが判断材料になる。
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const assigneeId = typeof body?.assigneeId === "string" ? body.assigneeId : null;
  if (!title) return NextResponse.json({ error: "タスク名が必要です" }, { status: 400 });

  let pastTasks: PastTask[] = [];
  if (assigneeId) {
    const { data } = await supabase
      .from("tasks")
      .select("title, estimated_hours, progress_comment")
      .eq("assignee_id", assigneeId)
      .not("estimated_hours", "is", null)
      .order("created_at", { ascending: false })
      .limit(15)
      .returns<PastTask[]>();
    pastTasks = data ?? [];
  }

  const result = await suggestEstimatedHours(title, pastTasks);
  if (!result) return NextResponse.json({ error: "見積もりできませんでした" }, { status: 500 });

  return NextResponse.json(result);
}
