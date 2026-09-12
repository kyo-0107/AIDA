"""Gmail連携のポーリング(F-104相当)。

Teams/OutlookはこのBotプロセスがMicrosoft Graphを直接ポーリングしているが、
Gmailだけはトークンの暗号化(AES-256-GCM)・リフレッシュ処理がすでにNext.js側
(web/app/api/poll-gmail/route.ts, web/lib/crypto.ts)にあるため、二重実装を避けて
ここではそのHTTPエンドポイントを定期的に叩くだけにする。
"""
import os
import threading
import time

import requests

POLL_INTERVAL_SECONDS = 120  # 2分おき


def poll_gmail_once():
    site_url = os.environ.get("SITE_URL")
    poll_secret = os.environ.get("POLL_SECRET")
    if not site_url or not poll_secret:
        return

    resp = requests.post(
        f"{site_url.rstrip('/')}/api/poll-gmail",
        headers={"Authorization": f"Bearer {poll_secret}"},
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        print("[gmail] poll-gmail errors:", data["errors"])


def start():
    """bot起動時に呼ぶ。裏でGmailポーリング(HTTP経由)を定期的に叩くスレッドを立てる。"""
    if not os.environ.get("SITE_URL") or not os.environ.get("POLL_SECRET"):
        print("[gmail] SITE_URL または POLL_SECRET が未設定のため、Gmailポーリングは無効です")
        return

    def loop():
        while True:
            try:
                poll_gmail_once()
            except Exception as e:
                print("[gmail] ポーリング失敗:", e)
            time.sleep(POLL_INTERVAL_SECONDS)

    threading.Thread(target=loop, daemon=True).start()
