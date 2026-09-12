"""Slack Bot / リマインダーから使う、サーバー側(admin)のデータアクセス関数。

RLS を無視して全件を見られる admin クライアントを使う。そのぶん「誰の代わりに聞かれているか」
(requester_email) を関数側で必ず絞り込みに使い、権限のない情報を漏らさないようにする。
ダッシュボード側のユーザー操作は web/ が別途 anon クライアント(RLS あり)で行う。
"""
from datetime import date

from .supa import admin_client

sb = admin_client()


def today():
    return date.today().isoformat()


# ── プロフィール ─────────────────────────────────────
def get_profile_by_email(email):
    if not email:
        return None
    r = sb.table("profiles").select("*").eq("email", email).execute()
    return r.data[0] if r.data else None


# ── プロジェクト(そのユーザーが所属するものだけ) ─────
def projects_for_user(user_id):
    r = (
        sb.table("project_members")
        .select("projects(*)")
        .eq("user_id", user_id)
        .execute()
    )
    return [row["projects"] for row in r.data if row.get("projects")]


def enabled_teams_integrations():
    """有効なTeams連携を、メンバーごとの行(1行=1人分)のまま返す(ポーリング元になる)。

    連携はメンバー各自が自分のアカウントで有効化する設計なので、同じプロジェクトに
    複数行(メンバー数分)あり得る。検知したタスクはこの行のuser_idに自動で担当付けする。
    """
    r = (
        sb.table("project_integrations")
        .select("project_id, user_id, external_team_id, external_channel_id, channel_name, last_synced_at, projects(name)")
        .eq("provider", "teams")
        .eq("enabled", True)
        .execute()
    )
    result = []
    for row in r.data:
        project = row.pop("projects", None) or {}
        row["project_name"] = project.get("name")
        result.append(row)
    return result


def update_teams_last_synced(project_id, user_id, timestamp_iso):
    sb.table("project_integrations").update({"last_synced_at": timestamp_iso}).eq(
        "project_id", project_id
    ).eq("provider", "teams").eq("user_id", user_id).execute()


def enabled_outlook_integrations():
    """有効なOutlook連携を、メンバーごとの行(1行=1人分)のまま返す(ポーリング元になる)。

    連携はメンバー各自が自分のアカウントで有効化する設計なので、同じプロジェクトに
    複数行(メンバー数分)あり得る。検知したタスクはこの行のuser_idに自動で担当付けする。
    """
    r = (
        sb.table("project_integrations")
        .select("project_id, user_id, external_channel_id, channel_name, last_synced_at, projects(name)")
        .eq("provider", "outlook")
        .eq("enabled", True)
        .execute()
    )
    result = []
    for row in r.data:
        project = row.pop("projects", None) or {}
        row["project_name"] = project.get("name")
        result.append(row)
    return result


def update_outlook_last_synced(project_id, user_id, timestamp_iso):
    sb.table("project_integrations").update({"last_synced_at": timestamp_iso}).eq(
        "project_id", project_id
    ).eq("provider", "outlook").eq("user_id", user_id).execute()


def project_by_channel(channel_id):
    """このSlackチャンネルIDが projects.slack_channel に設定されているプロジェクトを1件返す。"""
    if not channel_id:
        return None
    r = sb.table("projects").select("*").eq("slack_channel", channel_id).limit(1).execute()
    return r.data[0] if r.data else None


# ── Supabase MCP 経由でBotに答えさせる際の「見てよい範囲」 ──
def scope_notice(requester_email):
    """質問者が誰で、どのプロジェクトIDまでなら参照してよいかを文章にして返す。

    実データはここでは渡さない(Claude が Supabase MCP 経由で自分で取得する)。
    渡すのは「アクセスしてよい project_id の一覧」というアクセス境界の指示だけ。
    """
    profile = get_profile_by_email(requester_email)
    if profile is None:
        return "質問者はSupabase上のどのアカウントにも紐づいていません。「アカウントが見つかりません。ダッシュボードでの登録が必要です」とだけ答えてください。"

    my_projects = projects_for_user(profile["id"])
    if not my_projects:
        return (
            f"質問者は {profile['email']}（user_id={profile['id']}）です。"
            "参加しているプロジェクトはまだありません。"
        )

    ids = "、".join(str(p["id"]) for p in my_projects)
    names = "、".join(p["name"] for p in my_projects)
    return (
        f"質問者は {profile['email']}（user_id={profile['id']}）です。"
        f"質問者がメンバーである project_id は [{ids}]（{names}）のみです。"
    )


# ── メンバー ─────────────────────────────────────────
def members_of_project(project_id):
    r = (
        sb.table("project_members")
        .select("role, profiles(display_name, email)")
        .eq("project_id", project_id)
        .execute()
    )
    return [
        {
            "role": row["role"],
            "display_name": (row.get("profiles") or {}).get("display_name"),
            "email": (row.get("profiles") or {}).get("email"),
        }
        for row in r.data
    ]


# ── タスク自動収集(F-101/102/105/106/107) ─────────────
def create_task_from_source(
    project_id, title, progress_comment=None, priority="中", due_date=None,
    source="manual", source_url=None, assignee_id=None,
):
    """Slack等から検知・起票されたタスクを「承認待ち」で登録する。

    ユーザーが確認・修正・却下してから確定させる(F-106)ため、
    自動/半自動で作られたタスクは approval_status='pending' 固定で登録する。
    assignee_id: Teams/Outlookのように「誰の連携で検知したか」が分かる場合、
    検知した本人に自動で担当付けする(Slackのようにプロジェクト全体の投稿は None のまま)。
    """
    row = {
        "project_id": project_id,
        "title": title,
        "progress_comment": progress_comment,
        "priority": priority if priority in ("高", "中", "低") else "中",
        "due_date": due_date,
        "source": source,
        "source_url": source_url,
        "approval_status": "pending",
        "assignee_id": assignee_id,
    }
    r = sb.table("tasks").insert(row).execute()
    return r.data[0] if r.data else None


# ── タスク ───────────────────────────────────────────
def list_tasks(project_id):
    r = (
        sb.table("tasks")
        .select("*, profiles(display_name, email)")
        .eq("project_id", project_id)
        .order("due_date")
        .execute()
    )
    tasks = []
    for row in r.data:
        assignee = row.pop("profiles", None) or {}
        row["assignee_name"] = assignee.get("display_name") or assignee.get("email")
        tasks.append(row)
    return tasks


def due_tasks():
    """期限が今日以前・未完了・今日まだ通知していないタスク(全プロジェクト横断)。"""
    rows = (
        sb.table("tasks")
        .select("*, projects(name, slack_channel), profiles(display_name, email)")
        .lte("due_date", today())
        .neq("status", "完了")
        .order("due_date")
        .execute()
        .data
    )
    result = []
    for row in rows:
        if row.get("notified_at") == today():
            continue
        project = row.pop("projects", None) or {}
        assignee = row.pop("profiles", None) or {}
        row["project_name"] = project.get("name")
        row["slack_channel"] = project.get("slack_channel")
        row["assignee_name"] = assignee.get("display_name") or assignee.get("email")
        result.append(row)
    return result


def mark_notified(task_id):
    sb.table("tasks").update({"notified_at": today()}).eq("id", task_id).execute()
