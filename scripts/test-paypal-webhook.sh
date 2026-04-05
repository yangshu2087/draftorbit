#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${PAYPAL_CLIENT_ID:-}" || -z "${PAYPAL_CLIENT_SECRET:-}" || -z "${PAYPAL_WEBHOOK_ID:-}" ]]; then
  echo "[error] Missing required env: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET / PAYPAL_WEBHOOK_ID" >&2
  exit 1
fi

PAYPAL_API_BASE="${PAYPAL_API_BASE:-https://api-m.sandbox.paypal.com}"
PAYPAL_EVENT_TYPE="${PAYPAL_EVENT_TYPE:-BILLING.SUBSCRIPTION.ACTIVATED}"
PAYPAL_RESOURCE_VERSION="${PAYPAL_RESOURCE_VERSION:-2.0}"

echo "[info] Requesting PayPal access token from ${PAYPAL_API_BASE}"
token_json="$(curl -fsS -u "${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials' \
  "${PAYPAL_API_BASE}/v1/oauth2/token")"

access_token="$(python3 - <<'PY' "$token_json"
import json, sys
data = json.loads(sys.argv[1])
print(data.get("access_token",""))
PY
)"

if [[ -z "$access_token" ]]; then
  echo "[error] Failed to parse PayPal access_token" >&2
  exit 1
fi

echo "[info] Simulating webhook event: ${PAYPAL_EVENT_TYPE}"
simulate_payload="$(cat <<JSON
{
  "webhook_id": "${PAYPAL_WEBHOOK_ID}",
  "event_type": "${PAYPAL_EVENT_TYPE}",
  "resource_version": "${PAYPAL_RESOURCE_VERSION}"
}
JSON
)"

resp_with_code="$(curl -sS -w '\n%{http_code}' \
  -H "Authorization: Bearer ${access_token}" \
  -H 'Content-Type: application/json' \
  -d "${simulate_payload}" \
  "${PAYPAL_API_BASE}/v1/notifications/simulate-event")"

http_code="$(echo "$resp_with_code" | tail -n 1)"
resp_body="$(echo "$resp_with_code" | sed '$d')"

echo "[info] PayPal simulate-event response code: ${http_code}"
echo "$resp_body" | python3 -m json.tool || echo "$resp_body"

if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  echo "[error] simulate-event failed with HTTP ${http_code}" >&2
  exit 1
fi

echo "[ok] PayPal webhook simulation request sent."
