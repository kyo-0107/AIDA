import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken, graphGet } from "@/lib/msgraph";

// プロジェクト設定画面のチーム/チャンネル選択に使う一覧。
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const accessToken = await getValidAccessToken(supabase, user.id, "teams");
  if (!accessToken) {
    return NextResponse.json({ error: "Teamsと連携していません" }, { status: 400 });
  }

  try {
    const teamsRes = await graphGet(accessToken, "/me/joinedTeams?$select=id,displayName");
    const teams: { id: string; displayName: string }[] = teamsRes.value ?? [];

    const withChannels = await Promise.all(
      teams.map(async (team) => {
        const channelsRes = await graphGet(
          accessToken,
          `/teams/${team.id}/channels?$select=id,displayName`,
        );
        return {
          teamId: team.id,
          teamName: team.displayName,
          channels: (channelsRes.value ?? []).map((c: { id: string; displayName: string }) => ({
            id: c.id,
            name: c.displayName,
          })),
        };
      }),
    );

    return NextResponse.json({ teams: withChannels });
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
