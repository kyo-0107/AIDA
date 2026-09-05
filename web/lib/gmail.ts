import "server-only";

// 素の fetch で Google OAuth2 / Gmail API を直接叩く版。
// 以前は `googleapis` パッケージを使っていたが、内部でNode.js専用のHTTP実装(gaxios)に
// 依存しており、Cloudflare Workers上で「No access, refresh token, API key or refresh
// handler callback is set.」という実行時エラーが発生した(ローカルのNode.jsでは動いていた)。
// web/lib/msgraph.ts (Teams/Outlook側)と同じ、fetchベースの軽量な実装に統一する。

const SCOPES = "https://www.googleapis.com/auth/gmail.readonly openid email";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が設定されていません`);
  return value;
}

export function getGmailAuthUrl(state: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", requireEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", requireEnv("GOOGLE_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent"); // refresh_token を確実に受け取るため毎回同意させる
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
};

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`トークン取得に失敗しました: ${await res.text()}`);
  const tokens: TokenResponse = await res.json();

  const userinfoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userinfoRes.ok) throw new Error(`ユーザー情報取得に失敗しました: ${await userinfoRes.text()}`);
  const userinfo = await userinfoRes.json();

  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
    email: userinfo.email ?? null,
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`トークン更新に失敗しました: ${await res.text()}`);
  return res.json();
}

export type GmailFetchedMessage = {
  externalId: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string | null;
  permalink: string;
};

type TokenBundle = {
  accessToken: string;
  refreshToken: string | null;
};

// 送信者フィルタが空の場合は、送信者を問わず未読メールを全てチェックする
// (先生ごとにアドレスを事前登録する必要をなくすため)。既読にしたメールは次回以降拾わない。
function buildQuery(senders: string[]): string {
  const parts = senders.map((s) => s.trim()).filter(Boolean).map((s) => `from:${s}`);
  if (parts.length === 0) return "is:unread";
  return `(${parts.join(" OR ")}) is:unread`;
}

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

function decodeBody(payload: GmailMessagePart | undefined): string {
  function walk(part: GmailMessagePart | undefined): string | null {
    if (!part) return null;
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf8");
    }
    if (part.parts) {
      for (const p of part.parts) {
        const found = walk(p);
        if (found) return found;
      }
    }
    return null;
  }
  return walk(payload) ?? "";
}

function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

async function gmailFetch(accessToken: string, path: string) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res;
}

/**
 * sender_filter(カンマ区切りの送信者アドレス)に一致する直近メッセージを取得する。
 * 新しい access_token が発行された場合は onTokenRefresh で呼び出し元に通知する
 * (DBへの暗号化保存は呼び出し側の責務)。
 */
export async function fetchNewGmailMessages(
  tokens: TokenBundle,
  senders: string[],
  onTokenRefresh: (accessToken: string, expiryDate: string | null) => void,
): Promise<GmailFetchedMessage[]> {
  const query = buildQuery(senders);

  let accessToken = tokens.accessToken;

  async function withAutoRefresh(path: string): Promise<Response> {
    let res = await gmailFetch(accessToken, path);
    if (res.status === 401 && tokens.refreshToken) {
      const refreshed = await refreshGoogleToken(tokens.refreshToken);
      accessToken = refreshed.access_token;
      const expiryDate = refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null;
      onTokenRefresh(accessToken, expiryDate);
      res = await gmailFetch(accessToken, path);
    }
    return res;
  }

  const listRes = await withAutoRefresh(`/messages?q=${encodeURIComponent(query)}&maxResults=20`);
  if (!listRes.ok) throw new Error(`メッセージ一覧取得に失敗しました: ${await listRes.text()}`);
  const list: { messages?: { id: string }[] } = await listRes.json();

  const messages = list.messages ?? [];
  const results: GmailFetchedMessage[] = [];

  for (const m of messages) {
    if (!m.id) continue;
    const msgRes = await withAutoRefresh(`/messages/${m.id}?format=full`);
    if (!msgRes.ok) continue;
    const msg: {
      payload?: GmailMessagePart & { headers?: { name: string; value: string }[] };
      snippet?: string;
      internalDate?: string;
    } = await msgRes.json();

    const headers = msg.payload?.headers ?? [];
    results.push({
      externalId: m.id,
      from: header(headers, "From"),
      subject: header(headers, "Subject"),
      body: decodeBody(msg.payload) || msg.snippet || "",
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
      permalink: `https://mail.google.com/mail/u/0/#all/${m.id}`,
    });
  }

  return results;
}
