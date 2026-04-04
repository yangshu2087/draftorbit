# Stripe 开通记录（2026-04-04）

> 当前已完成：Stripe 账户激活 + Checkout 集成路径。

## 1) DraftOrbit 当前正式定价（USD）

- Starter：$19/月；$182.40/年（8 折）
- Growth（对应内部 `PRO`）：$49/月；$470.40/年（8 折）
- Max（对应内部 `PREMIUM`）：$99/月；$950.40/年（8 折）
- 默认试用：3 天（`BILLING_TRIAL_DAYS=3`）

## 2) 必填环境变量（生产）

```bash
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

STRIPE_STARTER_MONTHLY_PRICE_ID=price_xxx
STRIPE_STARTER_YEARLY_PRICE_ID=price_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx
STRIPE_PRO_YEARLY_PRICE_ID=price_xxx
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxx
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_xxx

BILLING_TRIAL_DAYS=3
BILLING_PAYPAL_FALLBACK_ENABLED=false
```

## 2.1) 已创建的 Stripe Sandbox（测试）对象

> 当前 Codex 连接的是 Stripe 沙盒账号（`acct_1TIK6ePUvgxtlOuH`），以下 ID 可直接用于测试环境。

```bash
# Products
STARTER_PRODUCT_ID=prod_UH2OVI7mbDqbHl
GROWTH_PRODUCT_ID=prod_UH2ONfezm8Uq10
MAX_PRODUCT_ID=prod_UH2OQBcUJA7vl7

# Prices
STRIPE_STARTER_MONTHLY_PRICE_ID=price_1TIUK1PUvgxtlOuHvjynYuO1
STRIPE_STARTER_YEARLY_PRICE_ID=price_1TIUK2PUvgxtlOuHylNcxsgu
STRIPE_PRO_MONTHLY_PRICE_ID=price_1TIUK3PUvgxtlOuHVlfvEor5
STRIPE_PRO_YEARLY_PRICE_ID=price_1TIUK4PUvgxtlOuHS8clD9CM
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_1TIUK6PUvgxtlOuHYsMtWNSL
STRIPE_PREMIUM_YEARLY_PRICE_ID=price_1TIUK7PUvgxtlOuHiwZ00PbH
```

可用于快速验证的测试支付链接（Starter 月付）：

- [https://buy.stripe.com/test_28E28tgpo2hm4YW2eIcIE03](https://buy.stripe.com/test_28E28tgpo2hm4YW2eIcIE03)

> 生产（Live）仍需在 Live 模式下创建同名产品与价格，并替换为 Live `price_...`。

## 3) Webhook 配置

- Endpoint：`https://api.draftorbit.ai/billing/webhook`
- 事件：
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## 4) 验收建议

1. 沙盒全链路验证（Checkout → webhook → 订阅状态回写）
2. 真实环境验收窗口临时改 `BILLING_TRIAL_DAYS=0`，做 1 笔真实小额支付与退款闭环
3. 验收后恢复 `BILLING_TRIAL_DAYS=3`
