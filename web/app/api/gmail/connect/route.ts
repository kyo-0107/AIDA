import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getGmailAuthUrl } from "@/lib/gmail";

// Gmail連携はTeams/Outlookと同じくユーザー単位(1人1アカウント)。
// どのプロジェクトで使うかは、接続後にプロジェクト詳細画面で個別に有効化する。
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const nonce = crypto.randomBytes(16).toString("hex");

  const res = NextResponse.redirect(getGmailAuthUrl(nonce));
  res.cookies.set("gmail_oauth_nonce", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
