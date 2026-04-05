#!/usr/bin/env bash
set -euo pipefail

# DraftOrbit one-click production release (web on Vercel)
# Usage:
#   bash scripts/release-prod.sh
# Optional envs:
#   DOMAIN=draftorbit.ai
#   API_DOMAIN=api.draftorbit.ai
#   POST_RELEASE_UAT_FULL=0
#   UAT_TOKEN=<token>

DOMAIN="${DOMAIN:-draftorbit.ai}"
API_DOMAIN="${API_DOMAIN:-api.draftorbit.ai}"
POST_RELEASE_UAT_FULL="${POST_RELEASE_UAT_FULL:-0}"

echo "[release] 1/4 运行类型检查"
npx pnpm@10.23.0 typecheck

echo "[release] 2/4 执行生产预检"
bash ./scripts/preflight-prod.sh

echo "[release] 3/4 发布 Web 到 Vercel（production）"
DEPLOY_OUTPUT="$(vercel deploy --prod --yes)"
echo "$DEPLOY_OUTPUT"

DEPLOY_URL="$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://[^ ]+\.vercel\.app' | tail -n 1 || true)"
if [[ -n "$DEPLOY_URL" ]]; then
  echo "[release] Vercel 部署地址：$DEPLOY_URL"
fi

echo "[release] 4/4 发布后健康检查"
curl -fsS --http1.1 --max-time 12 "https://${API_DOMAIN}/health" >/dev/null
curl -fsSI --http1.1 --max-time 12 "https://${DOMAIN}" >/dev/null

if [[ "$POST_RELEASE_UAT_FULL" == "1" ]]; then
  if [[ -z "${UAT_TOKEN:-${DRAFTORBIT_TOKEN:-}}" ]]; then
    echo "[release] ❌ POST_RELEASE_UAT_FULL=1 但未设置 UAT_TOKEN（或 DRAFTORBIT_TOKEN）"
    exit 1
  fi
  echo "[release] post-check 执行全量 UAT"
  UAT_TOKEN="${UAT_TOKEN:-${DRAFTORBIT_TOKEN:-}}" \
  API_URL="https://${API_DOMAIN}" \
  APP_URL="https://${DOMAIN}" \
  npx pnpm@10.23.0 uat:full
fi

echo "[release] ✅ 发布完成："
echo "  - 站点首页: https://${DOMAIN}"
echo "  - API 健康: https://${API_DOMAIN}/health"
