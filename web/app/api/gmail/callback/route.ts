import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedNonce = req.cookies.get("gmail_oauth_nonce")?.value;

  let projectId: number | null = null;
  try {
    const parsed = JSON.parse(Buffer.from(state ?? "", "base64url").toString("utf8"));
    if (!expectedNonce || parsed.nonce !== expectedNonce) throw new Error("state mismatch");
    projectId = Number(parsed.projectId);
  } catch {
    return NextResponse.redirect(new URL(`/project`, req.url) + "?error=invalid_oauth_state");
  }

  if (!code || !projectId) {
    return NextResponse.redirect(new URL("/project", req.url) + "?error=invalid_oauth_request");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "このプロジェクトのオーナーのみ連携できます" }, { status: 403 });
  }

  const redirectTo = new URL(`/project/${projectId}`, req.url);

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.accessToken || !tokens.email) {
      throw new Error("Googleからトークン/メールアドレスを取得できませんでした");
    }

    const admin = createAdminClient();
    // project_id + account_email の組で一意(同じアカウントの再連携は上書き、別アカウントなら追加)
    const { data: existing } = await admin
      .from("gmail_connections")
      .select("id, refresh_token")
      .eq("project_id", projectId)
      .eq("account_email", tokens.email)
      .maybeSingle();

    const payload = {
      project_id: projectId,
      account_email: tokens.email,
      access_token: encrypt(tokens.accessToken),
      // 再連携時にrefresh_tokenが返ってこない場合は既存の値を保持する
      ...(tokens.refreshToken ? { refresh_token: encrypt(tokens.refreshToken) } : {}),
      token_expires_at: tokens.expiryDate,
      connected_by: user.id,
    };

    const { error } = existing
      ? await admin.from("gmail_connections").update(payload).eq("id", existing.id)
      : await admin.from("gmail_connections").insert(payload);
    if (error) throw error;
  } catch (err: any) {
    const res = NextResponse.redirect(`${redirectTo}?error=${encodeURIComponent(err.message)}`);
    res.cookies.delete("gmail_oauth_nonce");
    return res;
  }

  const res = NextResponse.redirect(redirectTo);
  res.cookies.delete("gmail_oauth_nonce");
  return res;
}
