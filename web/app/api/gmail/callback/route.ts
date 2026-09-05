import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/gmail";
import { encrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedNonce = req.cookies.get("gmail_oauth_nonce")?.value;

  if (!code || !state || !expectedNonce || state !== expectedNonce) {
    return NextResponse.redirect(
      new URL(
        "/profile?gmail_error=" +
          encodeURIComponent("認証状態が確認できませんでした。もう一度お試しください。"),
        req.url,
      ),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.accessToken || !tokens.refreshToken || !tokens.email) {
      throw new Error("Googleからトークン/メールアドレスを取得できませんでした");
    }

    const { error } = await supabase.from("user_integrations").upsert(
      {
        user_id: user.id,
        provider: "gmail",
        account_email: tokens.email,
        access_token: encrypt(tokens.accessToken),
        refresh_token: encrypt(tokens.refreshToken),
        expires_at: tokens.expiryDate ?? new Date(Date.now() + 3600_000).toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error(error.message);

    const res = NextResponse.redirect(new URL("/profile?gmail_connected=1", req.url));
    res.cookies.delete("gmail_oauth_nonce");
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "不明なエラー";
    const res = NextResponse.redirect(
      new URL(`/profile?gmail_error=${encodeURIComponent(message)}`, req.url),
    );
    res.cookies.delete("gmail_oauth_nonce");
    return res;
  }
}
