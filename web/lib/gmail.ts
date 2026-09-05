import "server-only";
import { google } from "googleapis";

// task-hub-app の src/lib/gmail.ts を移植。GoogleのOAuthクライアントはtask-hub-appと同じものを再利用する
// (Google Cloud Console側で、このアプリ用のリダイレクトURIを追加登録している)。
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGmailAuthUrl(state: string): string {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // refresh_token を確実に受け取るため毎回同意させる
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ auth: client, version: "v2" });
  const { data: userinfo } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    email: userinfo.email ?? null,
  };
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

// 送信者フィルタが空の場合は、送信者を問わず直近の新着メールを全てチェックする
// (先生ごとにアドレスを事前登録する必要をなくすため)。
function buildQuery(senders: string[]): string {
  const parts = senders.map((s) => s.trim()).filter(Boolean).map((s) => `from:${s}`);
  if (parts.length === 0) return "newer_than:2d";
  return `(${parts.join(" OR ")}) newer_than:2d`;
}

function decodeBody(payload: any): string {
  function walk(part: any): string | null {
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

function header(headers: any[], name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/**
 * sender_filter(カンマ区切りの送信者アドレス)に一致する直近メッセージを取得する。
 * 新しい access_token が発行された場合は onTokenRefresh で呼び出し元に通知する
 * (DBへの暗号化保存は呼び出し側の責務)。
 */
export async function fetchNewGmailMessages(
  tokens: TokenBundle,
  senders: string[],
  onTokenRefresh: (accessToken: string, expiryDate: string | null) => void
): Promise<GmailFetchedMessage[]> {
  const query = buildQuery(senders);

  const client = oauthClient();
  client.setCredentials({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  client.on("tokens", (t) => {
    if (t.access_token) {
      onTokenRefresh(t.access_token, t.expiry_date ? new Date(t.expiry_date).toISOString() : null);
    }
  });

  const gmail = google.gmail({ version: "v1", auth: client });

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 20,
  });

  const messages = list.data.messages ?? [];
  const results: GmailFetchedMessage[] = [];

  for (const m of messages) {
    if (!m.id) continue;
    const { data: msg } = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "full",
    });
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
