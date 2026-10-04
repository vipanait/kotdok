#!/usr/bin/env bash
# Points the approval bot's webhook straight at Vercel, past the ru proxy.
#
# Telegram's servers are not in Russia and do not need the proxy; through it
# the approve button stopped reaching the app after lapka.my moved to Yandex
# Cloud (docs/architecture/ru-proxy.md, «Мимо прокси»).
#
# The token and secret are production's, read with `vercel env pull` into a
# temporary file that is removed on exit. Nothing is printed but the result.
#
# Usage: infra/telegram/set-webhook.sh [https://kotdok.vercel.app]
set -euo pipefail

cd "$(dirname "$0")/../.."
base="${1:-https://kotdok.vercel.app}"
url="${base%/}/api/telegram/webhook"

env_file="$(mktemp)"
trap 'rm -f "$env_file"' EXIT
vercel env pull --yes --environment=production "$env_file" >/dev/null
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_WEBHOOK_SECRET:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET came back empty from Vercel (a sensitive variable cannot be pulled)." >&2
  echo "Run the curl from README.md by hand with the values from the Vercel dashboard." >&2
  exit 1
fi

# The route ignores an update without a button, so this only proves the secret
# matches the deployment before Telegram is told to use it.
probe="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url" \
  -H 'Content-Type: application/json' \
  -H "X-Telegram-Bot-Api-Secret-Token: ${TELEGRAM_WEBHOOK_SECRET}" -d '{}')"
if [[ "$probe" != "200" ]]; then
  echo "$url answered $probe to the production secret; webhook left as it was." >&2
  exit 1
fi

curl -fsS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${url}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\"}" >/dev/null

curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" |
  python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print({k: r.get(k) for k in ("url","pending_update_count","last_error_message")})'
