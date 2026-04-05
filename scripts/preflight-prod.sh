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
#   RUN_W1_ACCEPTANCE=1            # 1=执行 W1 联动验收（默认开启）
#   W1_ACCEPTANCE_AUTO_BOOT=1      # 1=若本地服务未启动则自动拉起（默认开启）
#   W1_ACCEPTANCE_API_URL=http://127.0.0.1:4100
#   W1_ACCEPTANCE_APP_URL=http://127.0.0.1:3100
#   W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER=1  # 缺少 OPENROUTER_API_KEY 时，自动使用 mock（默认开启）
#   RUN_UAT_FULL=0                 # 1=执行全量 UAT（默认关闭）
#   UAT_FULL_REQUIRED=0            # 1=UAT 失败时阻断发布（默认关闭）
#   UAT_FULL_API_URL=https://api.draftorbit.ai
#   UAT_FULL_APP_URL=https://draftorbit.ai

DOMAIN="${DOMAIN:-draftorbit.ai}"
API_DOMAIN="${API_DOMAIN:-api.draftorbit.ai}"
WEB_PROJECT_DIR="${WEB_PROJECT_DIR:-apps/web}"
VERCEL_ENV="${VERCEL_ENV:-production}"
RUN_W1_ACCEPTANCE="${RUN_W1_ACCEPTANCE:-1}"
W1_ACCEPTANCE_AUTO_BOOT="${W1_ACCEPTANCE_AUTO_BOOT:-1}"
W1_ACCEPTANCE_API_URL="${W1_ACCEPTANCE_API_URL:-http://127.0.0.1:4100}"
W1_ACCEPTANCE_APP_URL="${W1_ACCEPTANCE_APP_URL:-http://127.0.0.1:3100}"
W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER="${W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER:-1}"
RUN_UAT_FULL="${RUN_UAT_FULL:-0}"
UAT_FULL_REQUIRED="${UAT_FULL_REQUIRED:-0}"
UAT_FULL_API_URL="${UAT_FULL_API_URL:-https://${API_DOMAIN}}"
UAT_FULL_APP_URL="${UAT_FULL_APP_URL:-https://${DOMAIN}}"
PREFLIGHT_TMP_DIR="${PREFLIGHT_TMP_DIR:-/tmp/draftorbit-preflight}"

ACCEPTANCE_API_PID=""
ACCEPTANCE_WEB_PID=""
ACCEPTANCE_API_LOG="${PREFLIGHT_TMP_DIR}/acceptance-api.log"
ACCEPTANCE_WEB_LOG="${PREFLIGHT_TMP_DIR}/acceptance-web.log"
PNPM_RUNNER=""

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

resolve_pnpm_runner() {
  if command -v pnpm >/dev/null 2>&1; then
    PNPM_RUNNER="pnpm"
    return 0
  fi
  if command -v npx >/dev/null 2>&1; then
    PNPM_RUNNER="npx pnpm@10.23.0"
    return 0
  fi
  return 1
}

run_pnpm() {
  if [[ -z "$PNPM_RUNNER" ]]; then
    if ! resolve_pnpm_runner; then
      fail '缺少 pnpm 与 npx，无法执行 Node 工作流命令。'
      return 1
    fi
  fi
  # shellcheck disable=SC2086
  $PNPM_RUNNER "$@"
}

parse_port() {
  local url="$1"
  local no_proto="${url#*://}"
  local host_port="${no_proto%%/*}"
  local proto="${url%%://*}"
  local port

  if [[ "$host_port" == *:* ]]; then
    port="${host_port##*:}"
  else
    if [[ "$proto" == "https" ]]; then
      port=443
    else
      port=80
    fi
  fi

  printf '%s' "$port"
}

need_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "缺少命令：${cmd}"
    return 1
  fi
  ok "已检测到命令：${cmd}"
}

is_url_ready() {
  local url="$1"
  local status
  status="$(curl -sS -L --http1.1 --max-time 8 -o /dev/null -w '%{http_code}' "$url" || true)"
  [[ "$status" =~ ^(200|201|202|204|301|302|307|308)$ ]]
}

wait_url_ready() {
  local url="$1"
  local timeout_seconds="${2:-90}"
  local i

  for ((i = 1; i <= timeout_seconds; i += 1)); do
    if is_url_ready "$url"; then
      ok "${url} 就绪（${i}s）"
      return 0
    fi
    sleep 1
  done

  fail "${url} 在 ${timeout_seconds}s 内未就绪"
  return 1
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
  local status=""
  local attempt
  for attempt in 1 2 3; do
    status="$(curl -sS -L --http1.1 --max-time 12 -o /dev/null -w '%{http_code}' "$url" || true)"
    if [[ "$status" =~ ^(200|301|302|307|308)$ ]]; then
      ok "${url} HTTPS 可访问（HTTP ${status}，attempt=${attempt})"
      return 0
    fi
    sleep 1
  done
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

cleanup_acceptance_stack() {
  if [[ -n "${ACCEPTANCE_WEB_PID:-}" ]] && kill -0 "$ACCEPTANCE_WEB_PID" >/dev/null 2>&1; then
    kill "$ACCEPTANCE_WEB_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${ACCEPTANCE_API_PID:-}" ]] && kill -0 "$ACCEPTANCE_API_PID" >/dev/null 2>&1; then
    kill "$ACCEPTANCE_API_PID" >/dev/null 2>&1 || true
  fi
}

ensure_local_acceptance_stack() {
  if is_url_ready "${W1_ACCEPTANCE_API_URL}/health" && is_url_ready "${W1_ACCEPTANCE_APP_URL}"; then
    ok "W1 验收目标服务已在线：${W1_ACCEPTANCE_API_URL} + ${W1_ACCEPTANCE_APP_URL}"
    return 0
  fi

  if [[ "$W1_ACCEPTANCE_AUTO_BOOT" != "1" ]]; then
    fail "W1 验收目标服务不可用，且 W1_ACCEPTANCE_AUTO_BOOT=0。请先手动启动服务。"
    return 1
  fi

  mkdir -p "$PREFLIGHT_TMP_DIR"
  : >"$ACCEPTANCE_API_LOG"
  : >"$ACCEPTANCE_WEB_LOG"

  local api_port web_port
  api_port="$(parse_port "$W1_ACCEPTANCE_API_URL")"
  web_port="$(parse_port "$W1_ACCEPTANCE_APP_URL")"

  step "自动拉起验收服务（API:${api_port} / WEB:${web_port}）"

  if ! is_url_ready "${W1_ACCEPTANCE_API_URL}/health"; then
    (
      set -a
      [[ -f ./.env ]] && source ./.env
      export OPENROUTER_FREE_MODELS="${OPENROUTER_FREE_MODELS:-openrouter/free}"
      export OPENROUTER_FLOOR_MODELS="${OPENROUTER_FLOOR_MODELS:-openrouter/free}"
      export OPENROUTER_HIGH_MODELS="${OPENROUTER_HIGH_MODELS:-openrouter/free}"
      if [[ -z "${OPENROUTER_API_KEY:-}" && "${W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER}" == "1" ]]; then
        export OPENROUTER_MOCK_MODE=1
      fi
      export PORT="$api_port"
      export API_URL="$W1_ACCEPTANCE_API_URL"
      export APP_URL="$W1_ACCEPTANCE_APP_URL"
      set +a
      run_pnpm --filter @draftorbit/api dev
    ) >"$ACCEPTANCE_API_LOG" 2>&1 &
    ACCEPTANCE_API_PID="$!"
    ok "已启动 API 进程（pid=${ACCEPTANCE_API_PID}）"
  else
    ok "API 已在线，跳过拉起"
  fi

  if ! is_url_ready "${W1_ACCEPTANCE_APP_URL}"; then
    (
      set -a
      [[ -f ./.env ]] && source ./.env
      export PORT="$web_port"
      export APP_URL="$W1_ACCEPTANCE_APP_URL"
      export NEXT_PUBLIC_API_URL="$W1_ACCEPTANCE_API_URL"
      set +a
      run_pnpm --filter @draftorbit/web dev
    ) >"$ACCEPTANCE_WEB_LOG" 2>&1 &
    ACCEPTANCE_WEB_PID="$!"
    ok "已启动 WEB 进程（pid=${ACCEPTANCE_WEB_PID}）"
  else
    ok "WEB 已在线，跳过拉起"
  fi

  wait_url_ready "${W1_ACCEPTANCE_API_URL}/health" 90 || {
    warn "API 启动日志：${ACCEPTANCE_API_LOG}"
    tail -n 80 "$ACCEPTANCE_API_LOG" || true
    return 1
  }
  wait_url_ready "${W1_ACCEPTANCE_APP_URL}" 90 || {
    warn "WEB 启动日志：${ACCEPTANCE_WEB_LOG}"
    tail -n 80 "$ACCEPTANCE_WEB_LOG" || true
    return 1
  }

  return 0
}

run_w1_acceptance() {
  if [[ -f ./.env ]]; then
    set -a
    source ./.env
    set +a
  fi

  if [[ -z "${JWT_SECRET:-}" ]]; then
    fail "JWT_SECRET 未配置，无法执行 W1 验收。"
    return 1
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    fail "DATABASE_URL 未配置，无法执行 W1 验收。"
    return 1
  fi

  if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
    if [[ "$W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER" == "1" ]]; then
      warn "OPENROUTER_API_KEY 未配置，W1 验收将以 OPENROUTER_MOCK_MODE=1 执行。"
    else
      fail "OPENROUTER_API_KEY 未配置，且 W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER!=1。"
      return 1
    fi
  fi

  ensure_local_acceptance_stack || return 1

  step '执行 W1 验收脚本（无自由文本链路 + 3 账号路由回放 + 截图）'
  local effective_mock_mode="${OPENROUTER_MOCK_MODE:-0}"
  if [[ -z "${OPENROUTER_API_KEY:-}" && "$W1_ACCEPTANCE_ALLOW_MOCK_OPENROUTER" == "1" ]]; then
    effective_mock_mode="1"
  fi

  if ! API_URL="$W1_ACCEPTANCE_API_URL" APP_URL="$W1_ACCEPTANCE_APP_URL" OPENROUTER_MOCK_MODE="$effective_mock_mode" run_pnpm acceptance:w1; then
    fail 'W1 验收失败'
    if [[ -f "$ACCEPTANCE_API_LOG" ]]; then
      warn "API 日志：${ACCEPTANCE_API_LOG}"
    fi
    if [[ -f "$ACCEPTANCE_WEB_LOG" ]]; then
      warn "WEB 日志：${ACCEPTANCE_WEB_LOG}"
    fi
    return 1
  fi

  ok 'W1 验收通过（报告已生成到仓库根目录）'
}

run_uat_full() {
  step '执行全量 UAT（生产测试租户）'
  if ! UAT_TOKEN="${UAT_TOKEN:-${DRAFTORBIT_TOKEN:-}}" API_URL="$UAT_FULL_API_URL" APP_URL="$UAT_FULL_APP_URL" run_pnpm uat:full; then
    if [[ "$UAT_FULL_REQUIRED" == "1" ]]; then
      fail '全量 UAT 失败（阻断发布）。'
      return 1
    fi
    warn '全量 UAT 失败（未阻断，继续后续流程）。'
    return 0
  fi
  ok '全量 UAT 通过'
}

main() {
  local failed=0

  trap cleanup_acceptance_stack EXIT

  step '基础命令检查'
  need_cmd vercel || failed=1
  need_cmd curl || failed=1
  need_cmd dig || failed=1
  need_cmd jq || failed=1
  if [[ "$RUN_W1_ACCEPTANCE" == "1" || "$RUN_UAT_FULL" == "1" ]]; then
    if resolve_pnpm_runner; then
      ok "已检测到 pnpm runner：${PNPM_RUNNER}"
    else
      fail '缺少 pnpm runner（pnpm 或 npx pnpm）'
      failed=1
    fi
    need_cmd node || failed=1
  fi

  step "Vercel 环境变量检查（${VERCEL_ENV}）"
  check_vercel_envs || failed=1

  step 'Cloudflare DNS / HTTPS 检查'
  check_dns "$DOMAIN" || failed=1
  check_dns "$API_DOMAIN" || failed=1
  check_https "https://${DOMAIN}" || failed=1
  check_https "https://${API_DOMAIN}/health" || failed=1

  step 'Stripe 钱包域名条件检查'
  check_stripe_wallet_domain || failed=1

  if [[ "$RUN_W1_ACCEPTANCE" == "1" ]]; then
    step 'W1 验收脚本联动'
    run_w1_acceptance || failed=1
  else
    step 'W1 验收脚本联动'
    warn '已跳过（RUN_W1_ACCEPTANCE!=1）'
  fi

  if [[ "$RUN_UAT_FULL" == "1" ]]; then
    step '全量 UAT 联动'
    run_uat_full || failed=1
  else
    step '全量 UAT 联动'
    warn '已跳过（RUN_UAT_FULL!=1）'
  fi

  if [[ "$failed" -ne 0 ]]; then
    printf '\n[preflight] 结果：❌ 未通过，请先修复以上项再发布。\n'
    exit 1
  fi

  printf '\n[preflight] 结果：✅ 全部通过，可以进入生产发布。\n'
}

main "$@"
