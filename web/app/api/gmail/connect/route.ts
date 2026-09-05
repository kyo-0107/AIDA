import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getGmailAuthUrl } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  // オーナーだけがGmail連携できる(projects_select_membersポリシー越しに、自分がowner_idの行かを確認)
  const { data: project } = await supabase
    .from("projects")
    .select("id, owner_id")
    .eq("id", Number(projectId))
    .maybeSingle();
  if (!project || project.owner_id !== user.id) {
    return NextResponse.json({ error: "このプロジェクトのオーナーのみ連携できます" }, { status: 403 });
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({ projectId, nonce })).toString("base64url");

  const res = NextResponse.redirect(getGmailAuthUrl(state));
  res.cookies.set("gmail_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
