#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"

echo "[smoke:v1] local session"
SESSION_JSON="$(curl -fsS -X POST "${API_URL}/auth/local/session")"
TOKEN="$(node -e "const data=JSON.parse(process.argv[1]);process.stdout.write(data.token||'')" "${SESSION_JSON}")"
if [[ -z "${TOKEN}" ]]; then
  echo "missing token from local session"
  exit 1
fi
AUTH_HEADER="Authorization: Bearer ${TOKEN}"

paths=(
  "/workspaces/me"
  "/x-accounts"
  "/topics"
  "/learning-sources"
  "/voice-profiles"
  "/playbooks"
  "/drafts"
  "/media"
  "/publish/jobs"
  "/reply-jobs"
  "/workflow/templates"
  "/workflow/runs"
  "/billing/plans"
  "/usage/summary"
  "/audit/logs"
)

for p in "${paths[@]}"; do
  echo "[smoke:v1] GET ${p}"
  curl -fsS "${API_URL}${p}" -H "${AUTH_HEADER}" >/dev/null
done

echo "[smoke:v1] ok"
