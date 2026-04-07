# DraftOrbit（draftorbit.ai）

面向 X（Twitter）的 **Chat-first AI 内容运营助手**，中文优先，支持 Web 平台 + Tauri 本地客户端壳 + 自托管部署。  
当前版本已引入 V2 一次性替换骨架：主入口 `/chat` 与 `/v2/*` API。

---

## 1) 当前交付范围（V2 Chat-first）

- 主入口：`/chat`（一句话意图 + 选项化简报 + 步骤推理 + 结果包 + 人工确认发布）
- 主 API：`/v2/*`（生成、知识接入、X 账号绑定、发布/回复路由、运营概览、计费）
- 兼容能力：保留核心后端模块（publish/reply/billing/usage）作为 V2 编排底座
- 部署形态：Web + API + Worker + PostgreSQL + Redis + Tauri 客户端壳
- 旧版工作台路由（`/dashboard`、`/drafts`、`/usage` 等）已统一重定向到 `/chat`

---

## 2) 技术栈

- **Web**: Next.js 16 + TypeScript + Tailwind
- **API**: NestJS + Prisma
- **Worker**: BullMQ + Redis
- **DB**: PostgreSQL 16
- **Queue**: Redis
- **Monorepo**: pnpm workspace + turbo

---

## 3) 快速启动（本地）

> 需要 Node.js 20+ 与 Docker。

```bash
cp .env.example .env
npx pnpm@10.23.0 install
```

### 3.1 仅基础依赖（推荐开发）
```bash
docker compose up -d postgres redis
npx pnpm@10.23.0 db:generate
npx pnpm@10.23.0 db:migrate
npx pnpm@10.23.0 db:seed

# 分别启动
npx pnpm@10.23.0 dev:api
npx pnpm@10.23.0 dev:web
npx pnpm@10.23.0 dev:worker
```

### 3.2 全栈容器一键启动
```bash
docker compose up -d --build
```

访问：
- Web: [http://localhost:3000/chat](http://localhost:3000/chat)
- API: [http://localhost:4000](http://localhost:4000)

---

## 4) Smoke 验证

```bash
# Legacy smoke（V1 历史脚本，已不再作为主验收）
npx pnpm@10.23.0 smoke:p0

# Legacy smoke（V1 历史脚本，已不再作为主验收）
npx pnpm@10.23.0 smoke:v1

# V2 全流程 UAT（生产测试租户，真实链路）
UAT_TOKEN=<测试租户token> \
API_URL=https://api.draftorbit.ai \
APP_URL=https://draftorbit.ai \
npx pnpm@10.23.0 uat:full
```

### 4.1 为什么 `smoke:p0` 必须使用唯一内容

- `smoke:p0` 会走真实审批链路，审批前会触发质量闸门（包含“重复内容”检查）。
- 如果脚本每次都提交完全相同的草稿文案，连续运行时会被判定为重复，导致审批返回 `QUALITY_GATE_BLOCKED`（HTTP 400）。
- 因此脚本内默认注入 `RUN_ID`（当前时间戳）到 topic/draft 标题与正文，确保每次 smoke 数据唯一，避免误报失败。
- CI 如需复现某次执行，可显式传入固定 `RUN_ID`：

```bash
RUN_ID=20260403-001 npx pnpm@10.23.0 smoke:p0
```

---

## 5) 关键环境变量

请参考 `.env.example`，重点包括：
- `JWT_SECRET`
- `BYOK_ENCRYPTION_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `AUTH_MODE`（`required` / `self_host_no_login`）
- `X_CLIENT_ID` / `X_CLIENT_SECRET` / `X_CALLBACK_URL`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`
- `OPENROUTER_API_KEY`（平台托管调用通道）
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_MONTHLY_PRICE_ID` / `STRIPE_STARTER_YEARLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID` / `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_PREMIUM_MONTHLY_PRICE_ID` / `STRIPE_PREMIUM_YEARLY_PRICE_ID`
- `BILLING_TRIAL_DAYS`（默认 3）
- `BILLING_PAYPAL_FALLBACK_ENABLED`（生产默认 `false`）
- `PAYPAL_API_BASE` / `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `PAYPAL_WEBHOOK_ID`

---

## 6) 生产发布前检查清单（Vercel + Stripe + Cloudflare）

### 6.1 Vercel（Production）环境变量

至少确保以下变量已在 `apps/web` 对应项目的 **production** 环境中配置：

- `NEXT_PUBLIC_API_URL`（应指向 `https://api.draftorbit.ai`）
- `NEXT_PUBLIC_ENABLE_LOCAL_LOGIN`（线上建议 `false`）
- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_CALLBACK_URL`（应为 `https://draftorbit.ai/auth/callback`）
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_STARTER_MONTHLY_PRICE_ID`
- `STRIPE_STARTER_YEARLY_PRICE_ID`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_YEARLY_PRICE_ID`
- `STRIPE_PREMIUM_MONTHLY_PRICE_ID`
- `STRIPE_PREMIUM_YEARLY_PRICE_ID`

### 6.2 Stripe 钱包域名条件（Google Pay / Apple Pay）

在 Stripe Dashboard 确认：

1. `Payment Method Domains` 中已添加并启用 `draftorbit.ai`
2. Checkout 使用 HTTPS（由 Vercel + Cloudflare 证书保证）
3. Apple Pay / Google Pay 是否显示受设备与浏览器影响（Safari/Chrome + 可用钱包）

### 6.3 Cloudflare DNS / HTTPS

至少满足：

- `draftorbit.ai` 已解析到 Vercel
- `api.draftorbit.ai` 已解析到你的 API 公网服务
- 两个域名都能通过 HTTPS 访问

可直接执行预检脚本（自动检查以上三类）：

```bash
npx pnpm@10.23.0 preflight:prod

# 如需联动全量 UAT
RUN_UAT_FULL=1 \
UAT_FULL_REQUIRED=1 \
UAT_TOKEN=<测试租户token> \
npx pnpm@10.23.0 preflight:prod
```

---

## 7) 一键上线指令集

### 7.1 一条命令发布（推荐）

```bash
npx pnpm@10.23.0 release:prod
```

该命令会按顺序执行：

1. `typecheck`
2. `preflight:prod`
3. `vercel deploy --prod --yes`（在 `apps/web`）
4. 发布后基础健康检查（站点首页 + API `/health`）

### 7.2 分步执行（便于排查）

```bash
npx pnpm@10.23.0 typecheck
npx pnpm@10.23.0 preflight:prod
cd apps/web && vercel deploy --prod --yes
curl -fsS https://api.draftorbit.ai/health
curl -fsSI https://draftorbit.ai

# 发布后再执行一轮全量 UAT（可选）
POST_RELEASE_UAT_FULL=1 \
UAT_TOKEN=<测试租户token> \
npx pnpm@10.23.0 release:prod
```

---

## 8) API 模块概览

- `auth` / `x-accounts`
- `workspaces` / `topics`
- `learning-sources` / `voice-profiles` / `playbooks`
- `drafts` / `naturalization` / `media`
- `publish` / `reply-jobs`
- `workflow`
- `usage` / `audit`

---



## 8.1 V2 API（新增）

- `POST /v2/chat/sessions`
- `POST /v2/chat/messages`
- `POST /v2/generate/run`
- `GET /v2/generate/:id`
- `GET /v2/generate/:id/stream`（SSE）
- `POST /v2/knowledge/connectors/obsidian`
- `POST /v2/knowledge/connectors/local-files`
- `POST /v2/knowledge/urls/import`
- `POST /v2/x-accounts/oauth/start`
- `GET /v2/x-accounts`
- `POST /v2/x-accounts/bind-manual`
- `PATCH /v2/x-accounts/:id/default`
- `PATCH /v2/x-accounts/:id/status`
- `DELETE /v2/x-accounts/:id`
- `GET /v2/x-accounts/oauth/callback`
- `POST /v2/style/profile/rebuild`
- `POST /v2/publish/queue`
- `GET /v2/publish/jobs`
- `POST /v2/publish/jobs/:id/retry`
- `GET /v2/reply/jobs`
- `POST /v2/reply/sync-mentions`
- `POST /v2/reply/:replyJobId/candidates`
- `POST /v2/reply/:replyJobId/candidates/:candidateId/approve`
- `POST /v2/reply/:replyJobId/send`
- `GET /v2/ops/dashboard`
- `GET /v2/usage/overview`
- `GET /v2/billing/plans`
- `GET /v2/billing/subscription`
- `GET /v2/billing/usage`
- `POST /v2/billing/checkout`
- `POST /v2/billing/subscription/cancel`
- `POST /v2/billing/refund`

## 9) 注意事项

1. `AUTH_MODE=self_host_no_login` 仅限开发/自托管测试环境，生产禁用。
2. 当 `AUTH_MODE=required`（生产默认）时，`/auth/local/session` 会返回 `404`，避免线上误用本地登录。
3. 敏感凭据采用加密存储（依赖 `BYOK_ENCRYPTION_KEY` 或 `JWT_SECRET`）。
4. 外部平台（X/Google/支付/图像）仍保留 stub 路径，便于后续真实接入。
5. 定价统一 USD，线上策略为 Starter $19 / Growth $49 / Max $99，支持 3 天试用（可通过 `BILLING_TRIAL_DAYS` 临时调为 0 做真实扣款验收）。
6. 登录页默认仅展示「X 登录」。当访问域名为 `localhost / 127.0.0.1 / *.local` 时，会自动显示「本地登录」入口；如需在自托管域名显示，可设置 `NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true`。

### X OAuth 常见报错排查（“你无法获得该应用的访问权限”）

如果点击「OAuth 绑定 X」后在 X 授权页看到该报错，优先检查：

1. `.env` 里不是占位值（`stub-` / `your-`）
   - `X_CLIENT_ID`
   - `X_CLIENT_SECRET`
2. 回调地址一致且已在 X 开发者后台登记
   - 本地推荐：`X_CALLBACK_URL=http://localhost:3000/auth/callback`
3. 修改 `.env` 后，已重启 API / Web 服务

### PayPal Webhook 配置与测试（Sandbox，可选回退链路）

1. 在 PayPal Developer 的 webhook 中将 URL 配置为：
   - `https://api.draftorbit.ai/billing/paypal/webhook`
2. 事件建议至少勾选：
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.UPDATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.SALE.COMPLETED`
   - `PAYMENT.SALE.REFUNDED`
   - `PAYMENT.SALE.REVERSED`
3. API 环境变量设置（仅当 `BILLING_PAYPAL_FALLBACK_ENABLED=true` 时需要）：
   - `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`
   - `PAYPAL_CLIENT_ID=...`
   - `PAYPAL_CLIENT_SECRET=...`
   - `PAYPAL_WEBHOOK_ID=...`
4. 本地快速触发一次模拟回调：

```bash
PAYPAL_CLIENT_ID=... \
PAYPAL_CLIENT_SECRET=... \
PAYPAL_WEBHOOK_ID=... \
bash ./scripts/test-paypal-webhook.sh
```

默认模拟事件为 `BILLING.SUBSCRIPTION.ACTIVATED`，可通过 `PAYPAL_EVENT_TYPE` 覆盖。
