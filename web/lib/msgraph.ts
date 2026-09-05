import "server-only";

export const TEAMS_SCOPES =
  "offline_access User.Read Chat.Read ChannelMessage.Read.All Team.ReadBasic.All Channel.ReadBasic.All";

// Mail.Read は(Teams系の権限と違い)基本的に管理者の同意なしでユーザー本人が同意できる
export const OUTLOOK_SCOPES = "offline_access User.Read Mail.Read";

const TOKEN_ENDPOINT = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

type Provider = "teams" | "outlook";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が設定されていません(.env.local を確認してください)`);
  return value;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  scopes: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("AZURE_CLIENT_ID"),
    client_secret: requireEnv("AZURE_CLIENT_SECRET"),
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: scopes,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`トークン取得に失敗しました: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string, scopes: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("AZURE_CLIENT_ID"),
    client_secret: requireEnv("AZURE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: scopes,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`トークン更新に失敗しました: ${await res.text()}`);
  return res.json();
}

export async function graphGet(accessToken: string, path: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Graph API呼び出しに失敗しました(${path}): ${await res.text()}`);
  return res.json();
}

const SCOPES_BY_PROVIDER: Record<Provider, string> = {
  teams: TEAMS_SCOPES,
  outlook: OUTLOOK_SCOPES,
};

/**
 * user_integrations に保存済みのトークンを取得し、期限切れなら更新してから返す。
 * 未接続の場合は null を返す。
 */
export async function getValidAccessToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  provider: Provider,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_integrations")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  const row = data as { access_token: string; refresh_token: string; expires_at: string } | null;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  const twoMinutes = 2 * 60 * 1000;
  if (expiresAt - Date.now() > twoMinutes) {
    return row.access_token;
  }

  const refreshed = await refreshAccessToken(row.refresh_token, SCOPES_BY_PROVIDER[provider]);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("user_integrations")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return refreshed.access_token;
}
