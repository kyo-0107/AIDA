#!/bin/bash
# ai-relay/server.mjs を常駐起動するラッパー。launchd から呼ばれる想定。
set -euo pipefail
cd "$(dirname "$0")"

set -a
source ./.env.local
set +a

exec /opt/homebrew/bin/node server.mjs
