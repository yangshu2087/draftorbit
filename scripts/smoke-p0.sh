#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
RUN_ID="${RUN_ID:-$(date +%s)}"

echo "[smoke:p0] run_id=${RUN_ID}"
echo "[smoke:p0] health check"
curl -fsS "${API_URL}/health" >/dev/null

echo "[smoke:p0] local session"
SESSION_JSON="$(curl -fsS -X POST "${API_URL}/auth/local/session")"
TOKEN="$(node -e "const data=JSON.parse(process.argv[1]);process.stdout.write(data.token||'')" "${SESSION_JSON}")"
if [[ -z "${TOKEN}" ]]; then
  echo "missing token from local session"
  exit 1
fi
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

echo "[smoke:p0] create topic"
TOPIC_JSON="$(curl -fsS -X POST "${API_URL}/topics" -H "${AUTH_HEADER}" -H 'Content-Type: application/json' -d "{\"title\":\"Smoke Topic ${RUN_ID}\",\"description\":\"p0-${RUN_ID}\"}")"
TOPIC_ID="$(node -e "const data=JSON.parse(process.argv[1]);process.stdout.write(data.id||'')" "${TOPIC_JSON}")"

if [[ -z "${TOPIC_ID}" ]]; then
  echo "topic create failed"
  exit 1
fi

echo "[smoke:p0] create + approve draft"
DRAFT_JSON="$(curl -fsS -X POST "${API_URL}/drafts" -H "${AUTH_HEADER}" -H 'Content-Type: application/json' -d "{\"title\":\"Smoke Draft ${RUN_ID}\",\"content\":\"Hello DraftOrbit，这是一次 smoke 测试内容（run:${RUN_ID}），欢迎评论交流并参与讨论。\"}")"
DRAFT_ID="$(node -e "const data=JSON.parse(process.argv[1]);process.stdout.write(data.id||'')" "${DRAFT_JSON}")"
if [[ -z "${DRAFT_ID}" ]]; then
  echo "draft create failed"
  exit 1
fi

curl -fsS -X POST "${API_URL}/drafts/${DRAFT_ID}/approve" -H "${AUTH_HEADER}" >/dev/null

echo "[smoke:p0] publish draft to queue"
PUBLISH_JSON="$(curl -fsS -X POST "${API_URL}/publish/draft" -H "${AUTH_HEADER}" -H 'Content-Type: application/json' -d "{\"draftId\":\"${DRAFT_ID}\"}")"
PUBLISH_JOB_ID="$(node -e "const data=JSON.parse(process.argv[1]);process.stdout.write(data.publishJobId||'')" "${PUBLISH_JSON}")"
if [[ -z "${PUBLISH_JOB_ID}" ]]; then
  echo "publish enqueue failed"
  exit 1
fi

echo "[smoke:p0] ok: run_id=${RUN_ID} publishJobId=${PUBLISH_JOB_ID}"
