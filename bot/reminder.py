# reminder.py — 毎朝きまった時刻に、期限が来たタスクを Slack に通知する
import threading
import time
from datetime import datetime

from . import db

NOTIFY_HOUR = 9    # 何時に送るか
NOTIFY_MIN = 0     # 何分に送るか


def build_message(rows):
    lines = ["おはよう！ 今日やるタスクだよ", ""]
    today = datetime.now().strftime("%Y-%m-%d")
    for t in rows:
        mark = "［今日が期限］" if t["due_date"] == today else "［期限切れ］"
        who = t["assignee_name"] or "担当未定"
        lines.append(f"{mark}{t['title']}（{who}）… 期限 {t['due_date']}")
    lines += ["", "終わったらダッシュボードでチェックを入れてね"]
    return "\n".join(lines)


def send_reminders(client):
    rows = db.due_tasks()
    if not rows:
        return
    by_channel = {}
    for t in rows:
        ch = t.get("slack_channel") or "#general"
        by_channel.setdefault(ch, []).append(t)
    for channel, items in by_channel.items():
        client.chat_postMessage(channel=channel, text=build_message(items))
        for t in items:
            db.mark_notified(t["id"])  # 送った印をつける(二重通知よけ)


def start(client):
    """bot の起動時に呼ぶ。裏で1分おきに時計を見張るスレッドを立てる。"""

    def loop():
        while True:
            now = datetime.now()
            if now.hour == NOTIFY_HOUR and now.minute == NOTIFY_MIN:
                try:
                    send_reminders(client)
                except Exception as e:
                    print("リマインダー失敗:", e)
            time.sleep(60)

    threading.Thread(target=loop, daemon=True).start()
