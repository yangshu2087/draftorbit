#!/usr/bin/env bash
set -euo pipefail

# DraftOrbit Stripe live cutover helper
# - Pulls production envs from Vercel
# - Validates STRIPE_SECRET_KEY
# - Creates/reuses DraftOrbit products/prices in Stripe
# - Upserts required STRIPE_*_PRICE_ID env vars to Vercel production
#
# Usage:
#   bash scripts/stripe-live-cutover.sh
#
# Optional env:
#   VERCEL_ENV=production
#   WEB_PROJECT_DIR=apps/web
#   API_PROJECT_DIR=apps/api

VERCEL_ENV="${VERCEL_ENV:-production}"
WEB_PROJECT_DIR="${WEB_PROJECT_DIR:-apps/web}"
API_PROJECT_DIR="${API_PROJECT_DIR:-apps/api}"

step() {
  printf '\n[cutover] %s\n' "$1"
}

fail() {
  printf '  ❌ %s\n' "$1"
}

ok() {
  printf '  ✅ %s\n' "$1"
}

upsert_vercel_env() {
  local key="$1"
  local value="$2"
  vercel env rm "$key" "$VERCEL_ENV" --yes >/dev/null 2>&1 || true
  printf '%s\n' "$value" | vercel env add "$key" "$VERCEL_ENV" >/dev/null
}

step "拉取 Vercel ${VERCEL_ENV} 环境变量"
tmp_env="$(mktemp)"
tmp_json="$(mktemp)"
trap 'rm -f "$tmp_env" "$tmp_json"' EXIT

(cd "$WEB_PROJECT_DIR" && vercel env pull "$tmp_env" --environment="$VERCEL_ENV" --yes >/dev/null)
ok "环境变量拉取成功"

stripe_key="$(
  python3 - <<'PY' "$tmp_env"
from pathlib import Path
import sys
text = Path(sys.argv[1]).read_text()
for line in text.splitlines():
    if line.startswith("STRIPE_SECRET_KEY="):
        value = line.split("=", 1)[1].strip().strip('"').strip("'")
        value = value.replace("\\n", "").replace("\r", "").replace("\n", "").strip()
        print(value)
        break
PY
)"

if [[ -z "$stripe_key" ]]; then
  fail "未找到 STRIPE_SECRET_KEY（Vercel ${VERCEL_ENV}）"
  exit 1
fi

if [[ "$stripe_key" != sk_live_* ]]; then
  fail "STRIPE_SECRET_KEY 不是 live key（当前前缀：${stripe_key:0:8}）"
  exit 1
fi
ok "检测到 live key 前缀"

step "验证 Stripe key 可用性"
account_status="$(
  curl -sS -o /tmp/stripe-account-check.json -w '%{http_code}' \
    -u "${stripe_key}:" \
    https://api.stripe.com/v1/account || true
)"
if [[ "$account_status" != "200" ]]; then
  fail "Stripe key 校验失败（HTTP ${account_status}）。请在 Stripe Dashboard 重新生成可用 live secret key 后重试。"
  exit 1
fi
ok "Stripe key 校验通过"

step "创建/复用 Live 产品与价格"
(
  cd "$API_PROJECT_DIR"
  STRIPE_KEY="$stripe_key" node - <<'NODE' > "$tmp_json"
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_KEY);

const plans = [
  {
    key: 'STARTER',
    name: 'DraftOrbit Starter',
    description: 'DraftOrbit Starter monthly/yearly subscription',
    monthly: 1900,
    yearly: 18240
  },
  {
    key: 'PRO',
    name: 'DraftOrbit Growth',
    description: 'DraftOrbit Growth (internal PRO) monthly/yearly subscription',
    monthly: 4900,
    yearly: 47040
  },
  {
    key: 'PREMIUM',
    name: 'DraftOrbit Max',
    description: 'DraftOrbit Max (internal PREMIUM) monthly/yearly subscription',
    monthly: 9900,
    yearly: 95040
  }
];

async function ensureProduct(plan) {
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find(
    (p) => p.name === plan.name || p.metadata?.draftorbit_plan === plan.key
  );
  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: {
        app: 'draftorbit',
        draftorbit_plan: plan.key
      }
    });
  }
  return product;
}

async function ensurePrice(productId, amount, interval, planKey) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  let price = prices.data.find(
    (p) =>
      p.currency === 'usd' &&
      p.unit_amount === amount &&
      p.type === 'recurring' &&
      p.recurring?.interval === interval
  );
  if (!price) {
    price = await stripe.prices.create({
      product: productId,
      unit_amount: amount,
      currency: 'usd',
      recurring: { interval },
      metadata: {
        app: 'draftorbit',
        draftorbit_plan: planKey,
        billing_cycle: interval === 'year' ? 'YEARLY' : 'MONTHLY'
      }
    });
  }
  return price;
}

(async () => {
  const out = {};
  for (const plan of plans) {
    const product = await ensureProduct(plan);
    const monthly = await ensurePrice(product.id, plan.monthly, 'month', plan.key);
    const yearly = await ensurePrice(product.id, plan.yearly, 'year', plan.key);
    out[plan.key] = {
      productId: product.id,
      monthlyPriceId: monthly.id,
      yearlyPriceId: yearly.id,
      livemode: Boolean(product.livemode && monthly.livemode && yearly.livemode)
    };
  }
  console.log(JSON.stringify(out, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
)

ok "Live 产品与价格准备完成"

starter_monthly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["STARTER"]["monthlyPriceId"])
PY
)"
starter_yearly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["STARTER"]["yearlyPriceId"])
PY
)"
pro_monthly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["PRO"]["monthlyPriceId"])
PY
)"
pro_yearly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["PRO"]["yearlyPriceId"])
PY
)"
premium_monthly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["PREMIUM"]["monthlyPriceId"])
PY
)"
premium_yearly="$(python3 - <<'PY' "$tmp_json"
import json, sys
data = json.load(open(sys.argv[1]))
print(data["PREMIUM"]["yearlyPriceId"])
PY
)"

step "回写 Vercel 生产环境变量"
(
  cd "$WEB_PROJECT_DIR"
  upsert_vercel_env STRIPE_STARTER_MONTHLY_PRICE_ID "$starter_monthly"
  upsert_vercel_env STRIPE_STARTER_YEARLY_PRICE_ID "$starter_yearly"
  upsert_vercel_env STRIPE_PRO_MONTHLY_PRICE_ID "$pro_monthly"
  upsert_vercel_env STRIPE_PRO_YEARLY_PRICE_ID "$pro_yearly"
  upsert_vercel_env STRIPE_PREMIUM_MONTHLY_PRICE_ID "$premium_monthly"
  upsert_vercel_env STRIPE_PREMIUM_YEARLY_PRICE_ID "$premium_yearly"
  upsert_vercel_env BILLING_TRIAL_DAYS "3"
  upsert_vercel_env BILLING_PAYPAL_FALLBACK_ENABLED "false"
)
ok "Vercel 变量写入完成"

printf '\n[cutover] 已生成 Live Price IDs（可用于核对）:\n'
printf '  STRIPE_STARTER_MONTHLY_PRICE_ID=%s\n' "$starter_monthly"
printf '  STRIPE_STARTER_YEARLY_PRICE_ID=%s\n' "$starter_yearly"
printf '  STRIPE_PRO_MONTHLY_PRICE_ID=%s\n' "$pro_monthly"
printf '  STRIPE_PRO_YEARLY_PRICE_ID=%s\n' "$pro_yearly"
printf '  STRIPE_PREMIUM_MONTHLY_PRICE_ID=%s\n' "$premium_monthly"
printf '  STRIPE_PREMIUM_YEARLY_PRICE_ID=%s\n' "$premium_yearly"

printf '\n[cutover] 下一步建议：\n'
printf '  1) bash scripts/preflight-prod.sh\n'
printf '  2) 临时 BILLING_TRIAL_DAYS=0 验收真实扣款\n'
printf '  3) 验收后恢复 BILLING_TRIAL_DAYS=3\n'

