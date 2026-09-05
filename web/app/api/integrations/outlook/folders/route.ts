import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, graphGet } from "@/lib/msgraph";

// プロジェクト設定画面のフォルダ選択に使う一覧。
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const accessToken = await getValidAccessToken(supabase, user.id, "outlook");
  if (!accessToken) {
    return NextResponse.json({ error: "Outlookと連携していません" }, { status: 400 });
  }

  try {
    const res = await graphGet(accessToken, "/me/mailFolders?$select=id,displayName&$top=50");
    const folders = (res.value ?? []).map((f: { id: string; displayName: string }) => ({
      id: f.id,
      name: f.displayName,
    }));
    return NextResponse.json({ folders });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
