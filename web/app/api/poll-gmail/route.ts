import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { fetchNewGmailMessages } from "@/lib/gmail";
import { taskifyEmail } from "@/lib/claude-taskify";

type PollResult = {
  projectsProcessed: number;
  messagesFetched: number;
  tasksCreated: number;
  errors: string[];
};

// task-hub-app の /api/poll と同方式。手動実行(curl)、または将来的に外部cronから叩く想定。
// Authorization: Bearer <POLL_SECRET> が一致しない場合は拒否する。
//
// Gmail連携はTeams/Outlookと同じく、アカウントはユーザー単位(user_integrations)、
// どのプロジェクトで有効かはプロジェクト単位(project_integrations)で管理する。
// 実際にどのアカウントで取得するかは「プロジェクトのオーナー」が接続したGmailアカウントを使う。
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.POLL_SECRET}`;
  if (!process.env.POLL_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result: PollResult = {
    projectsProcessed: 0,
    messagesFetched: 0,
    tasksCreated: 0,
    errors: [],
  };

  type GmailProjectIntegration = {
    project_id: number;
    sender_filter: string | null;
    projects: { owner_id: string } | null;
  };

  const { data: integrations, error: integErr } = await admin
    .from("project_integrations")
    .select("project_id, sender_filter, projects(owner_id)")
    .eq("provider", "gmail")
    .eq("enabled", true)
    .returns<GmailProjectIntegration[]>();
  if (integErr) {
    result.errors.push(`連携設定取得失敗: ${integErr.message}`);
    return NextResponse.json(result);
  }

  for (const integ of integrations ?? []) {
    const projectId = integ.project_id;
    const ownerId = integ.projects?.owner_id;
    if (!ownerId) continue;

    result.projectsProcessed++;
    try {
      const { data: account } = await admin
        .from("user_integrations")
        .select("access_token, refresh_token, expires_at")
        .eq("user_id", ownerId)
        .eq("provider", "gmail")
        .maybeSingle();
      if (!account) {
        result.errors.push(`project=${projectId}: オーナーがGmailと連携していません`);
        continue;
      }

      // 送信者フィルタが空なら、送信者を問わず新着メール全てが対象になる(gmail.tsのbuildQuery側の仕様)
      const senders = (integ.sender_filter ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);

      let refreshedAccess: string | null = null;
      let refreshedExpiry: string | null = null;

      const messages = await fetchNewGmailMessages(
        { accessToken: decrypt(account.access_token), refreshToken: decrypt(account.refresh_token) },
        senders,
        (accessToken, expiryDate) => {
          refreshedAccess = accessToken;
          refreshedExpiry = expiryDate;
        },
      );

      if (refreshedAccess) {
        await admin
          .from("user_integrations")
          .update({
            access_token: encrypt(refreshedAccess),
            expires_at: refreshedExpiry ?? new Date(Date.now() + 3600_000).toISOString(),
          })
          .eq("user_id", ownerId)
          .eq("provider", "gmail");
      }

      if (messages.length === 0) continue;

      const permalinks = messages.map((m) => m.permalink);
      const { data: existingTasks } = await admin
        .from("tasks")
        .select("source_url")
        .eq("project_id", projectId)
        .eq("source", "gmail")
        .in("source_url", permalinks);
      const existingUrls = new Set((existingTasks ?? []).map((t) => t.source_url));

      const newMessages = messages.filter((m) => !existingUrls.has(m.permalink));
      result.messagesFetched += newMessages.length;

      for (const msg of newMessages) {
        let judged;
        try {
          judged = await taskifyEmail(`差出人: ${msg.from}\n件名: ${msg.subject}\n\n${msg.body}`);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          result.errors.push(`AI判定失敗 (project=${projectId}/${msg.externalId}): ${message}`);
          continue;
        }

        if (!judged.isTask) continue;

        const { error: insertErr } = await admin.from("tasks").insert({
          project_id: projectId,
          title: (judged.title || msg.subject || "無題のタスク").slice(0, 60),
          progress_comment: judged.description ?? msg.body.slice(0, 500),
          priority: judged.priority,
          due_date: judged.dueDate,
          source: "gmail",
          source_url: msg.permalink,
          approval_status: "pending",
        });
        if (insertErr) {
          result.errors.push(`保存失敗 (project=${projectId}/${msg.externalId}): ${insertErr.message}`);
        } else {
          result.tasksCreated++;
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push(`連携処理失敗 (project=${projectId}): ${message}`);
    }
  }

  return NextResponse.json(result);
}
