#!/usr/bin/env bash
set -euo pipefail

# DraftOrbit production preflight
# Usage:
#   bash scripts/preflight-prod.sh
# Optional envs:
#   DOMAIN=draftorbit.ai
#   API_DOMAIN=api.draftorbit.ai
#   WEB_PROJECT_DIR=apps/web
#   VERCEL_ENV=production

DOMAIN="${DOMAIN:-draftorbit.ai}"
API_DOMAIN="${API_DOMAIN:-api.draftorbit.ai}"
WEB_PROJECT_DIR="${WEB_PROJECT_DIR:-apps/web}"
VERCEL_ENV="${VERCEL_ENV:-production}"

REQUIRED_VERCEL_ENVS=(
  NEXT_PUBLIC_API_URL
  NEXT_PUBLIC_ENABLE_LOCAL_LOGIN
  X_CLIENT_ID
  X_CLIENT_SECRET
  X_CALLBACK_URL
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_STARTER_MONTHLY_PRICE_ID
  STRIPE_STARTER_YEARLY_PRICE_ID
  STRIPE_PRO_MONTHLY_PRICE_ID
  STRIPE_PRO_YEARLY_PRICE_ID
  STRIPE_PREMIUM_MONTHLY_PRICE_ID
  STRIPE_PREMIUM_YEARLY_PRICE_ID
)

step() {
  printf '\n[preflight] %s\n' "$1"
}

ok() {
  printf '  ✅ %s\n' "$1"
}

warn() {
  printf '  ⚠️  %s\n' "$1"
}

fail() {
  printf '  ❌ %s\n' "$1"
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "缺少命令：${cmd}"
    return 1
  fi
  ok "已检测到命令：${cmd}"
}

check_dns() {
  local host="$1"
  local resolved
  resolved="$(dig +short "$host" A | tr '\n' ' ' | xargs || true)"
  if [[ -z "$resolved" ]]; then
    resolved="$(dig +short "$host" CNAME | tr '\n' ' ' | xargs || true)"
  fi
  if [[ -z "$resolved" ]]; then
    fail "${host} 未解析到 A/CNAME 记录"
    return 1
  fi
  ok "${host} DNS 解析：${resolved}"
}

check_https() {
  local url="$1"
  local status
  status="$(curl -sS -L --max-time 12 -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$status" =~ ^(200|301|302|307|308)$ ]]; then
    ok "${url} HTTPS 可访问（HTTP ${status}）"
    return 0
  fi
  fail "${url} HTTPS 检查失败（HTTP ${status:-N/A}）"
  return 1
}

check_vercel_envs() {
  local tmp_file
  tmp_file="$(mktemp)"
  local missing=0

  if ! (cd "$WEB_PROJECT_DIR" && vercel env pull "$tmp_file" --environment="$VERCEL_ENV" --yes >/dev/null 2>&1); then
    fail "无法拉取 Vercel ${VERCEL_ENV} 环境变量，请先 vercel login 并确认项目已 link。"
    rm -f "$tmp_file"
    return 1
  fi

  for key in "${REQUIRED_VERCEL_ENVS[@]}"; do
    if grep -q "^${key}=" "$tmp_file"; then
      ok "Vercel 环境变量已配置：${key}"
    else
      fail "Vercel 环境变量缺失：${key}"
      missing=1
    fi
  done

  if [[ "$missing" -ne 0 ]]; then
    rm -f "$tmp_file"
    return 1
  fi

  rm -f "$tmp_file"
}

check_stripe_wallet_domain() {
  if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
    warn "未设置 STRIPE_SECRET_KEY（本机环境），跳过 Stripe 钱包域名自动校验。"
    warn "请在 Stripe Dashboard > Payment Method Domains 确认 ${DOMAIN} 状态为 enabled。"
    return 0
  fi

  local response
  response="$(
    curl -sS https://api.stripe.com/v1/payment_method_domains \
      -u "${STRIPE_SECRET_KEY}:" \
      -G \
      --data-urlencode "limit=100"
  )"

  if ! echo "$response" | jq -e '.data' >/dev/null 2>&1; then
    fail 'Stripe API 返回异常，无法校验 Payment Method Domains。'
    return 1
  fi

  local match
  match="$(
    echo "$response" | jq -r --arg d "$DOMAIN" '
      .data[]? | select(.domain_name == $d) |
      "\(.domain_name)|enabled=\(.enabled)|apple=\(.apple_pay.status // "unknown")|google=\(.google_pay.status // "unknown")"
    ' | head -n 1
  )"

  if [[ -z "$match" ]]; then
    fail "Stripe 未找到域名 ${DOMAIN} 的钱包配置（Payment Method Domain）。"
    return 1
  fi

  ok "Stripe 钱包域名状态：${match}"
}

main() {
  local failed=0

  step '基础命令检查'
  need_cmd vercel || failed=1
  need_cmd curl || failed=1
  need_cmd dig || failed=1
  need_cmd jq || failed=1

  step "Vercel 环境变量检查（${VERCEL_ENV}）"
  check_vercel_envs || failed=1

  step 'Cloudflare DNS / HTTPS 检查'
  check_dns "$DOMAIN" || failed=1
  check_dns "$API_DOMAIN" || failed=1
  check_https "https://${DOMAIN}" || failed=1
  check_https "https://${API_DOMAIN}/health" || failed=1

  step 'Stripe 钱包域名条件检查'
  check_stripe_wallet_domain || failed=1

  if [[ "$failed" -ne 0 ]]; then
    printf '\n[preflight] 结果：❌ 未通过，请先修复以上项再发布。\n'
    exit 1
  fi

  printf '\n[preflight] 结果：✅ 全部通过，可以进入生产发布。\n'
}

main "$@"
