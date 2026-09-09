import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestPriority } from "@/lib/priority";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const dueDate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : null;
  const estimatedHours =
    typeof body?.estimatedHours === "number" && Number.isFinite(body.estimatedHours)
      ? body.estimatedHours
      : null;
  if (!title) return NextResponse.json({ error: "タスク名が必要です" }, { status: 400 });

  const result = await suggestPriority(title, dueDate, estimatedHours, new Date());
  if (!result) return NextResponse.json({ error: "優先度を判断できませんでした" }, { status: 500 });

  return NextResponse.json(result);
}
