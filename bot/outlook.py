"""Outlookの受信フォルダを定期ポーリングし、タスクらしいメールをAIが検知して承認待ちタスクを作る(F-104)。

Teamsと違い Mail.Read は管理者同意が基本的に不要なため、個人アカウントでも接続しやすい。
"""
import threading
import time
from datetime import datetime, timezone

from . import db, msgraph
from .task_classifier import classify, strip_html

POLL_INTERVAL_SECONDS = 120  # 2分おき


def poll_outlook(ask_claude):
    for integ in db.enabled_outlook_integrations():
        user_id = integ.get("user_id")
        folder_id = integ.get("external_channel_id")
        project_id = integ["project_id"]
        if not user_id or not folder_id:
            continue

        # 初回はいまの時刻を基準点として保存するだけにして、既存の古いメールは処理しない
        if not integ.get("last_synced_at"):
            db.update_outlook_last_synced(project_id, user_id, datetime.now(timezone.utc).isoformat())
            continue

        access_token = msgraph.get_valid_access_token(db.sb, user_id, "outlook")
        if not access_token:
            continue

        last_synced_dt = datetime.fromisoformat(integ["last_synced_at"].replace("Z", "+00:00"))

        try:
            messages = msgraph.list_folder_messages(access_token, folder_id)
        except Exception as e:
            print(f"[outlook] {integ.get('project_name')} のメール取得に失敗: {e}")
            continue

        newest_seen = last_synced_dt
        for m in sorted(messages, key=lambda x: x.get("receivedDateTime", "")):
            received = m.get("receivedDateTime")
            if not received:
                continue
            received_dt = datetime.fromisoformat(received.replace("Z", "+00:00"))
            if received_dt <= last_synced_dt:
                continue
            if received_dt > newest_seen:
                newest_seen = received_dt

            subject = m.get("subject") or ""
            body = strip_html((m.get("body") or {}).get("content")) or m.get("bodyPreview") or ""
            sender = ((m.get("from") or {}).get("emailAddress") or {}).get("address") or ""
            text = f"件名: {subject}\n差出人: {sender}\n本文: {body}"

            info = classify(ask_claude, text)
            if not info:
                continue

            db.create_task_from_source(
                project_id=project_id,
                title=info["title"],
                progress_comment=info["description"],
                priority=info["priority"],
                due_date=info["due_date"],
                source="outlook",
                source_url=m.get("webLink"),
                assignee_id=user_id,
            )

        if newest_seen > last_synced_dt:
            db.update_outlook_last_synced(project_id, user_id, newest_seen.isoformat())


def start(ask_claude):
    """bot起動時に呼ぶ。裏でOutlookの受信フォルダを定期ポーリングするスレッドを立てる。"""

    def loop():
        while True:
            try:
                poll_outlook(ask_claude)
            except Exception as e:
                print("[outlook] ポーリング失敗:", e)
            time.sleep(POLL_INTERVAL_SECONDS)

    threading.Thread(target=loop, daemon=True).start()
