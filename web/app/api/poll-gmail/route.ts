import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { fetchNewGmailMessages } from "@/lib/gmail";
import { taskifyEmail } from "@/lib/claude-taskify";

type PollResult = {
  connectionsProcessed: number;
  messagesFetched: number;
  tasksCreated: number;
  errors: string[];
};

// task-hub-app の /api/poll と同方式。手動実行(curl)、または将来的に外部cronから叩く想定。
// Authorization: Bearer <POLL_SECRET> が一致しない場合は拒否する。
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.POLL_SECRET}`;
  if (!process.env.POLL_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result: PollResult = {
    connectionsProcessed: 0,
    messagesFetched: 0,
    tasksCreated: 0,
    errors: [],
  };

  const { data: connections, error: connErr } = await admin.from("gmail_connections").select("*");
  if (connErr) {
    result.errors.push(`連携アカウント取得失敗: ${connErr.message}`);
    return NextResponse.json(result);
  }

  for (const conn of connections ?? []) {
    result.connectionsProcessed++;
    try {
      // 送信者フィルタが空なら、送信者を問わず新着メール全てが対象になる(gmail.tsのbuildQuery側の仕様)
      const senders = (conn.sender_filter ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      let refreshedAccess: string | null = null;
      let refreshedExpiry: string | null = null;

      const messages = await fetchNewGmailMessages(
        { accessToken: decrypt(conn.access_token), refreshToken: conn.refresh_token ? decrypt(conn.refresh_token) : null },
        senders,
        (accessToken, expiryDate) => {
          refreshedAccess = accessToken;
          refreshedExpiry = expiryDate;
        }
      );

      if (refreshedAccess) {
        await admin
          .from("gmail_connections")
          .update({ access_token: encrypt(refreshedAccess), token_expires_at: refreshedExpiry })
          .eq("id", conn.id);
      }

      if (messages.length === 0) continue;

      const permalinks = messages.map((m) => m.permalink);
      const { data: existingTasks } = await admin
        .from("tasks")
        .select("source_url")
        .eq("project_id", conn.project_id)
        .eq("source", "gmail")
        .in("source_url", permalinks);
      const existingUrls = new Set((existingTasks ?? []).map((t) => t.source_url));

      const newMessages = messages.filter((m) => !existingUrls.has(m.permalink));
      result.messagesFetched += newMessages.length;

      for (const msg of newMessages) {
        let judged;
        try {
          judged = await taskifyEmail(`差出人: ${msg.from}\n件名: ${msg.subject}\n\n${msg.body}`);
        } catch (e: any) {
          result.errors.push(`AI判定失敗 (project=${conn.project_id}/${msg.externalId}): ${e.message}`);
          continue;
        }

        if (!judged.isTask) continue;

        const { error: insertErr } = await admin.from("tasks").insert({
          project_id: conn.project_id,
          title: (judged.title || msg.subject || "無題のタスク").slice(0, 60),
          progress_comment: judged.description ?? msg.body.slice(0, 500),
          priority: judged.priority,
          due_date: judged.dueDate,
          source: "gmail",
          source_url: msg.permalink,
          approval_status: "pending",
        });
        if (insertErr) {
          result.errors.push(`保存失敗 (project=${conn.project_id}/${msg.externalId}): ${insertErr.message}`);
        } else {
          result.tasksCreated++;
        }
      }
    } catch (e: any) {
      result.errors.push(`連携処理失敗 (project=${conn.project_id}): ${e.message}`);
    }
  }

  return NextResponse.json(result);
}
