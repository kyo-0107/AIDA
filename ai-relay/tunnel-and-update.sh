#!/bin/bash
# cloudflared のquick tunnelを起動し、発行された公開URLを検知したら
# `wrangler secret put AI_RELAY_URL` でWorker(aida)に自動反映する。
# quick tunnelは再起動のたびにURLが変わるため、起動のたびにこの処理を行う。
set -uo pipefail
cd "$(dirname "$0")"

WEB_DIR="../web"
LOG_FILE="/tmp/digit-app-cloudflared.log"
CLOUDFLARED=/opt/homebrew/bin/cloudflared

: > "$LOG_FILE"

"$CLOUDFLARED" tunnel --url http://localhost:8787 >>"$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | head -1 || true)
  if [ -n "$URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$URL" ]; then
  echo "[tunnel-and-update] トンネルURLの検出に失敗しました。ログ: $LOG_FILE" >&2
else
  echo "[tunnel-and-update] tunnel URL: $URL"
  ( cd "$WEB_DIR" && printf '%s' "$URL" | npx wrangler secret put AI_RELAY_URL ) \
    && echo "[tunnel-and-update] Worker(aida)のAI_RELAY_URLを更新しました。" \
    || echo "[tunnel-and-update] wrangler secret put に失敗しました。" >&2
fi

wait "$TUNNEL_PID"
