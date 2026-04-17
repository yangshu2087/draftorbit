# DraftOrbit Billing + Stripe 测试报告（2026-04-04）

## 1) 代码与配置改造完成项

- 订阅模型升级为 3 档：`STARTER / PRO / PREMIUM`（对外展示 `Starter / Growth / Max`）
- 周期升级为：`MONTHLY / YEARLY`
- 价格矩阵（USD）已固化到单一 `PlanCatalog`：
  - Starter：1900（月）/ 18240（年）
  - Growth：4900（月）/ 47040（年）
  - Max：9900（月）/ 95040（年）
- 试用天数改为 `BILLING_TRIAL_DAYS`（默认 3）
- `Subscription` 增加 `billingInterval`
- 启动安全检查：生产或 live key 模式下缺少任一 Stripe price env 会直接拒绝启动
- 前端价格页支持月付/年付切换，默认仅 Stripe 结账入口；PayPal 仅保留后端 fallback 开关

## 2) 数据库迁移结果

执行：

```bash
npx pnpm@10.23.0 db:migrate
```

结果：

- migration `20260404_billing_starter_yearly` 已成功应用。

## 3) Stripe 资源创建与核验（Sandbox）

### 3.1 账号上下文

- Stripe Account: `acct_1TIK6ePUvgxtlOuH`
- 模式：`livemode=false`（沙盒）

### 3.2 已创建产品

- Starter: `prod_UH2OVI7mbDqbHl`
- Growth: `prod_UH2ONfezm8Uq10`
- Max: `prod_UH2OQBcUJA7vl7`

### 3.3 已创建价格（USD）

- Starter Monthly: `price_1TIUK1PUvgxtlOuHvjynYuO1`（$19）
- Starter Yearly: `price_1TIUK2PUvgxtlOuHylNcxsgu`（$182.40）
- Growth Monthly: `price_1TIUK3PUvgxtlOuHVlfvEor5`（$49）
- Growth Yearly: `price_1TIUK4PUvgxtlOuHS8clD9CM`（$470.40）
- Max Monthly: `price_1TIUK6PUvgxtlOuHYsMtWNSL`（$99）
- Max Yearly: `price_1TIUK7PUvgxtlOuHiwZ00PbH`（$950.40）

### 3.4 支付链路探测

- 已创建 Starter 月付测试支付链接：
  - `https://buy.stripe.com/test_28E28tgpo2hm4YW2eIcIE03`
- 结果：可成功生成 checkout URL，说明价格对象可用。

## 4) 自动化测试结果

执行：

```bash
npx pnpm@10.23.0 --filter @draftorbit/api test
npx pnpm@10.23.0 typecheck
```

结果：

- API 测试 16/16 通过（含计划映射、试用天数、env 安全检查）
- Monorepo typecheck 全部通过

## 4.1) 运行态接口验证（本机 API）

在 `AUTH_MODE=self_host_no_login` 下启动 API 并实际请求：

- `GET /billing/plans`：返回 `Starter/Growth/Max` 三档，含 `monthly/yearly` 金额与 `limits`
- `POST /billing/checkout`（`STARTER+MONTHLY`）：在未配置 Stripe Secret 的情况下返回  
  `400 支付通道未完成配置，请联系管理员`（符合预期）
- `POST /billing/checkout`（非法 `cycle=WEEKLY`）：返回  
  `400 无效的订阅方案或计费周期`（入参校验生效）

## 5) 生产（Live）上线前唯一待办

> 当前已完成“代码 + 沙盒资源 + 测试验证”。
> 正式扣款上线还需要在 **Stripe Live 模式**创建同名产品/价格并替换以下 env：

- `STRIPE_SECRET_KEY=sk_live_...`
- `STRIPE_WEBHOOK_SECRET=whsec_...`
- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `STRIPE_STARTER_YEARLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_PREMIUM_MONTHLY_PRICE_ID`
- `STRIPE_PREMIUM_YEARLY_PRICE_ID`

Webhook：

- `https://api.draftorbit.ai/billing/webhook`
- 事件：
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## 6) Live 验收建议（与你锁定策略一致）

1. 临时将 `BILLING_TRIAL_DAYS=0` 并部署
2. 完成 1 笔 Starter 月付真实扣款
3. 验证 webhook 200、订阅状态回写、账单可见
4. 执行取消/退款闭环
5. 恢复 `BILLING_TRIAL_DAYS=3` 并再次部署

## 7) 2026-04-04 Live 切换清单执行结果（实操）

已执行：

1. `bash scripts/preflight-prod.sh`
   - 结果：失败（缺少 6 个 `STRIPE_*_PRICE_ID` 生产变量）
2. 新增并执行自动切换脚本：
   - `bash scripts/stripe-live-cutover.sh`
   - 结果：在 Stripe key 校验阶段失败（`HTTP 401`）
3. 已补充生产变量：
   - `BILLING_TRIAL_DAYS=3`
   - `BILLING_PAYPAL_FALLBACK_ENABLED=false`

当前阻塞项：

- Vercel production 中的 `STRIPE_SECRET_KEY` 前缀为 `sk_live_`，但实际调用 Stripe API 返回 401（key 无效/已失效/权限异常）
- 因 Stripe live key 校验失败，无法自动创建 live 产品与价格，也无法写入 6 个 live `price_id`

## 8) 2026-04-04 第二轮实操（已解除阻塞并完成）

### 8.1 Stripe Live 对象创建（已完成）

- Starter Product: `prod_UH31fCsuWmv9un`
  - Monthly: `price_1TIUvaBYpivUoMHz8SujOVpL`
  - Yearly: `price_1TIUvbBYpivUoMHzEgiSNPyu`
- Growth(PRO) Product: `prod_UH31324be9p3Gw`
  - Monthly: `price_1TIUvcBYpivUoMHzBWqk2b97`
  - Yearly: `price_1TIUvcBYpivUoMHzwGFL1UXg`
- Max(PREMIUM) Product: `prod_UH1rLsBDt0owdI`
  - Monthly: `price_1TITnzBYpivUoMHzZbGjlHqW`
  - Yearly: `price_1TIUveBYpivUoMHzuEvNnNr0`

### 8.2 Stripe Webhook（Live）创建并回写 secret（已完成）

- Endpoint: `https://api.draftorbit.ai/billing/webhook`
- Webhook Endpoint ID: `we_1TIV0WBYpivUoMHz3pF3Ijnk`
- 事件：
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

### 8.3 Stripe Payment Method Domain（已完成）

- 域名：`draftorbit.ai`
- Payment Method Domain ID: `pmd_1TIV2iBYpivUoMHzAv2tyypy`
- 状态：`enabled=true`，`apple=active`，`google=active`

### 8.4 Vercel production 环境变量（已完成）

已写入：

- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `STRIPE_STARTER_YEARLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_PREMIUM_MONTHLY_PRICE_ID`
- `STRIPE_PREMIUM_YEARLY_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`（live）
- `BILLING_PAYPAL_FALLBACK_ENABLED=false`
- `BILLING_TRIAL_DAYS=0`（用于真实扣款验收窗口）

### 8.5 发布状态

- 已执行 production 部署并 alias 到 `https://draftorbit.ai`
- 预检（含 Stripe 域名校验）通过
