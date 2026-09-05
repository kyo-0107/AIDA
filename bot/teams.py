"""Teamsチャンネルを定期ポーリングし、タスクらしいメッセージをAIが検知して承認待ちタスクを作る(F-101/103)。

Microsoft Graphのプッシュ通知(change notifications)は公開HTTPSエンドポイントが要るため、
ローカル開発中のこのBotではポーリング方式にしている。将来デプロイしたら webhook 化を検討する。
"""
import threading
import time
from datetime import datetime, timezone

from . import db, msgraph
from .task_classifier import classify, strip_html

POLL_INTERVAL_SECONDS = 120  # 2分おき


def poll_teams(ask_claude):
    for integ in db.enabled_teams_integrations():
        owner_id = integ.get("owner_id")
        team_id = integ.get("external_team_id")
        channel_id = integ.get("external_channel_id")
        project_id = integ["project_id"]
        if not owner_id or not team_id or not channel_id:
            continue

        # 初回はいまの時刻を基準点として保存するだけにして、既存の古いメッセージは処理しない
        if not integ.get("last_synced_at"):
            db.update_teams_last_synced(project_id, datetime.now(timezone.utc).isoformat())
            continue

        access_token = msgraph.get_valid_access_token(db.sb, owner_id, "teams")
        if not access_token:
            continue

        last_synced_dt = datetime.fromisoformat(integ["last_synced_at"].replace("Z", "+00:00"))

        try:
            messages = msgraph.list_channel_messages(access_token, team_id, channel_id)
        except Exception as e:
            print(f"[teams] {integ.get('project_name')} のメッセージ取得に失敗: {e}")
            continue

        newest_seen = last_synced_dt
        for m in sorted(messages, key=lambda x: x.get("createdDateTime", "")):
            created = m.get("createdDateTime")
            if not created:
                continue
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if created_dt <= last_synced_dt:
                continue
            if created_dt > newest_seen:
                newest_seen = created_dt

            if (m.get("from") or {}).get("application"):
                continue  # ボット等の投稿は無視

            text = strip_html((m.get("body") or {}).get("content"))
            if not text:
                continue

            info = classify(ask_claude, text)
            if not info:
                continue

            db.create_task_from_source(
                project_id=project_id,
                title=info["title"],
                progress_comment=info["description"],
                priority=info["priority"],
                due_date=info["due_date"],
                source="teams",
                source_url=m.get("webUrl"),
            )

        if newest_seen > last_synced_dt:
            db.update_teams_last_synced(project_id, newest_seen.isoformat())


def start(ask_claude):
    """bot起動時に呼ぶ。裏でTeamsチャンネルを定期ポーリングするスレッドを立てる。"""

    def loop():
        while True:
            try:
                poll_teams(ask_claude)
            except Exception as e:
                print("[teams] ポーリング失敗:", e)
            time.sleep(POLL_INTERVAL_SECONDS)

    threading.Thread(target=loop, daemon=True).start()
