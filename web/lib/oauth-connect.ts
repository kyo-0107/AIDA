import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, graphGet } from "@/lib/msgraph";

type ProviderConfig = {
  provider: "teams" | "outlook";
  scopes: string;
  callbackPath: string; // 例: "/api/integrations/teams/callback"
};

/**
 * F-101/103/104: 各ツール連携の「接続する」ボタンから呼ばれる開始点。
 * ユーザーを Microsoft のログイン/同意画面へ送る。CSRF対策として、ここで発行した
 * ランダム値をコールバック側でCookieと突き合わせて検証する(stateだけを信用しない)。
 */
export function makeConnectHandler(config: ProviderConfig) {
  return async function GET(request: NextRequest) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", request.url));

    const clientId = process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: "AZURE_CLIENT_ID が .env.local に設定されていません" },
        { status: 500 },
      );
    }

    const redirectUri = new URL(config.callbackPath, request.url).toString();
    const state = randomUUID();

    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_mode", "query");
    authUrl.searchParams.set("scope", config.scopes);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(authUrl.toString());
    response.cookies.set(`${config.provider}_oauth_state`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return response;
  };
}

export function makeCallbackHandler(config: ProviderConfig) {
  return async function GET(request: NextRequest) {
    const url = request.nextUrl;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error_description") || url.searchParams.get("error");
    const cookieName = `${config.provider}_oauth_state`;
    const expectedState = request.cookies.get(cookieName)?.value;

    if (errorParam) {
      return NextResponse.redirect(
        new URL(`/profile?${config.provider}_error=${encodeURIComponent(errorParam)}`, request.url),
      );
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.redirect(
        new URL(
          `/profile?${config.provider}_error=` +
            encodeURIComponent("認証状態が確認できませんでした。もう一度お試しください。"),
          request.url,
        ),
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", request.url));

    const redirectUri = new URL(config.callbackPath, request.url).toString();

    try {
      const tokens = await exchangeCodeForTokens(code, redirectUri, config.scopes);
      const me = await graphGet(tokens.access_token, "/me?$select=mail,userPrincipalName");
      const accountEmail = me.mail || me.userPrincipalName || null;

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      const { error } = await supabase.from("user_integrations").upsert(
        {
          user_id: user.id,
          provider: config.provider,
          account_email: accountEmail,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
        },
        { onConflict: "user_id,provider" },
      );
      if (error) throw new Error(error.message);

      const response = NextResponse.redirect(
        new URL(`/profile?${config.provider}_connected=1`, request.url),
      );
      response.cookies.delete(cookieName);
      return response;
    } catch (e) {
      const message = e instanceof Error ? e.message : "不明なエラー";
      return NextResponse.redirect(
        new URL(`/profile?${config.provider}_error=${encodeURIComponent(message)}`, request.url),
      );
    }
  };
}
