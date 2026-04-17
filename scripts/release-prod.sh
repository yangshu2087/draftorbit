#!/usr/bin/env bash
set -euo pipefail

# DraftOrbit one-click production release (web on Vercel)
# Usage:
#   bash scripts/release-prod.sh
# Optional envs:
#   DOMAIN=draftorbit.ai
#   API_DOMAIN=api.draftorbit.ai
#   POST_RELEASE_UAT_FULL=0
#   POST_RELEASE_API_SMOKE=1
#   UAT_TOKEN=<token>

DOMAIN="${DOMAIN:-draftorbit.ai}"
API_DOMAIN="${API_DOMAIN:-api.draftorbit.ai}"
POST_RELEASE_UAT_FULL="${POST_RELEASE_UAT_FULL:-0}"
POST_RELEASE_API_SMOKE="${POST_RELEASE_API_SMOKE:-1}"
AUTH_TOKEN="${UAT_TOKEN:-${DRAFTORBIT_TOKEN:-}}"

resolve_uat_token_if_needed() {
  if [[ -n "$AUTH_TOKEN" ]]; then
    return 0
  fi

  echo "[release] 尝试自动解析生产测试租户 token..."
  if AUTH_TOKEN="$(node ./scripts/resolve-uat-token.mjs 2>/tmp/draftorbit-resolve-uat-token.log)"; then
    echo "[release] ✅ 已自动解析 UAT token"
    return 0
  fi

  echo "[release] ⚠️ 自动解析 UAT token 失败（详见 /tmp/draftorbit-resolve-uat-token.log）"
  return 1
}

echo "[release] 1/4 运行类型检查"
npx -y pnpm@10.23.0 typecheck

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

if [[ "$POST_RELEASE_API_SMOKE" == "1" ]]; then
  if ! resolve_uat_token_if_needed; then
    echo "[release] ⚠️ 跳过 API 回归（未提供 UAT_TOKEN / DRAFTORBIT_TOKEN）"
  else
    echo "[release] post-check 执行 API 回归：/v2/ops/dashboard /v2/usage/overview /v2/x-accounts"
    curl -fsS --http1.1 --max-time 20 \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      "https://${API_DOMAIN}/v2/ops/dashboard" >/dev/null
    curl -fsS --http1.1 --max-time 20 \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      "https://${API_DOMAIN}/v2/usage/overview?eventsLimit=20&days=14" >/dev/null
    curl -fsS --http1.1 --max-time 20 \
      -H "Authorization: Bearer ${AUTH_TOKEN}" \
      "https://${API_DOMAIN}/v2/x-accounts?pageSize=20" >/dev/null
  fi
fi

if [[ "$POST_RELEASE_UAT_FULL" == "1" ]]; then
  if ! resolve_uat_token_if_needed; then
    echo "[release] ❌ POST_RELEASE_UAT_FULL=1 但未设置 UAT_TOKEN（或 DRAFTORBIT_TOKEN）"
    exit 1
  fi
  echo "[release] post-check 执行全量 UAT"
  UAT_TOKEN="${AUTH_TOKEN}" \
  API_URL="https://${API_DOMAIN}" \
  APP_URL="https://${DOMAIN}" \
  UAT_STRICT_ASSERTIONS=1 \
  npx -y pnpm@10.23.0 uat:full
fi

echo "[release] ✅ 发布完成："
echo "  - 站点首页: https://${DOMAIN}"
echo "  - API 健康: https://${API_DOMAIN}/health"
