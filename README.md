# DraftOrbit（draftorbit.io）

面向 X（Twitter）的 **AI 内容运营工作台**，中文优先，支持 Web 平台与自托管部署。  
当前版本按“阶段 A 直接可用 + 阶段 B/C 同步收敛”的目标实现了可运行骨架与主链路。

---

## 1) 当前交付范围（上线级收敛）

### 阶段 A（24h 可用闭环）
- 本地登录会话（`/auth/local/session`）
- Topic Center（`/topics`）
- Draft Studio（`/drafts`）
- 审批通过后入发布队列（`/drafts/:id/approve` + `/publish/draft`）
- Publish Queue + Worker 执行 + 状态回写
- 基础审计日志（`/audit/logs`）
- Docker Compose 一键启动：`web/api/worker/postgres/redis`

### 阶段 B/C（同步补齐的可运行基础版）
- Google 登录骨架（`/auth/google/authorize` + `/auth/google/callback`）
- X 账号绑定骨架（`/x-accounts`）
- Learning Sources / Voice Profiles / Playbooks
- Naturalization Layer（规则 + Provider 路由接口）
- Image & Media Center（上传占位 + 生成占位）
- Reply Assistant（mentions sync stub + 候选审批发送）
- Workflow Center（模板 + 运行记录）
- Provider Hub（BYOK + 平台兜底 + 路由测试）
- Usage/Billing、Audit Logs 页面与 API

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
- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000)

---

## 4) Smoke 验证

```bash
# 阶段 A 主链路 smoke（topic -> draft -> approve -> publish queue）
npx pnpm@10.23.0 smoke:p0

# 阶段 B/C 模块点亮 smoke
npx pnpm@10.23.0 smoke:v1
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
- `OPENROUTER_API_KEY`（平台兜底）

---

## 6) API 模块概览

- `auth` / `x-accounts`
- `workspaces` / `topics`
- `learning-sources` / `voice-profiles` / `playbooks`
- `drafts` / `naturalization` / `media`
- `publish` / `reply-jobs`
- `workflow` / `providers`
- `usage` / `audit`

---

## 7) 注意事项

1. `AUTH_MODE=self_host_no_login` 仅限开发/自托管测试环境，生产禁用。
2. 敏感凭据采用加密存储（依赖 `BYOK_ENCRYPTION_KEY` 或 `JWT_SECRET`）。
3. 外部平台（X/Google/支付/图像）仍保留 stub 路径，便于后续真实接入。

### X OAuth 常见报错排查（“你无法获得该应用的访问权限”）

如果点击「OAuth 绑定 X」后在 X 授权页看到该报错，优先检查：

1. `.env` 里不是占位值（`stub-` / `your-`）
   - `X_CLIENT_ID`
   - `X_CLIENT_SECRET`
2. 回调地址一致且已在 X 开发者后台登记
   - 本地推荐：`X_CALLBACK_URL=http://localhost:3000/auth/callback`
3. 修改 `.env` 后，已重启 API / Web 服务
