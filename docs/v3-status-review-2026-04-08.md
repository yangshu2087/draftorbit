# DraftOrbit V3 状态评审（2026-04-08）

> 评审对象：当前 `codex/design-md-rollout` 工作树中的 V3 改造  
> 当前分支：`codex/design-md-rollout`  
> 当前 HEAD：`a8d35bcd21fc63061520a54ecdd52cb5c69466a3`

## 1. 结论

- **结论 1（高）**：V3 已从文档阶段进入**可运行原型阶段**。  
  证据：存在 `/v3/*` API、`/app /connect /queue` 页面、V3 本地 UAT 报告。
- **结论 2（高）**：V3 当前状态更适合描述为**“本地可验证、尚未完成提交评审”**，而不是“已完成发布候选”。  
  证据：当前工作树存在大量未提交改动；发布报告仍只覆盖 V2。
- **结论 3（高）**：V3 核心壳层与最小闭环已经连通，但仍带有**V2/V3 混合依赖**和少量文案/路由残留。  
  证据：`/v3/*` API 已新增；但 OAuth callback 仍走 `/v2/x-accounts/oauth/callback`；错误页/404 页仍写“聊天中枢”并指向 `/chat`。

## 2. 评审范围

本次评审基于四类证据：

1. 当前工作树文件
2. 最新 V3 本地 UAT 报告
3. 新增 API 测试与当前 typecheck/test 结果
4. 当前路由与脚本实现

不包含：

- 新一轮生产发布
- 新一轮真实生产 UAT
- Stripe / X 外部真链路重新验收

## 3. Fresh verification（本轮重新执行）

### 3.1 API tests

命令：

```bash
npx pnpm@10.23.0 --filter @draftorbit/api test
```

结果：

- **31/31 通过**
- 新增覆盖到：
  - `cors-origin.test.ts`
  - `v3-service-helpers.test.ts`

### 3.2 API typecheck

命令：

```bash
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
```

结果：

- 通过（exit 0）

### 3.3 Web typecheck

命令：

```bash
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
```

结果：

- 通过（exit 0）

## 4. 已确认存在且有证据的 V3 能力

### 4.1 页面壳

已存在页面：

- `/` → `apps/web/app/page.tsx`
- `/app` → `apps/web/app/app/page.tsx`
- `/connect` → `apps/web/app/connect/page.tsx`
- `/queue` → `apps/web/app/queue/page.tsx`
- `/pricing` → 现有 pricing 页面继续沿用

对应 V3 组件：

- `apps/web/components/v3/home-page.tsx`
- `apps/web/components/v3/operator-app.tsx`
- `apps/web/components/v3/connect-page.tsx`
- `apps/web/components/v3/queue-page.tsx`
- `apps/web/components/v3/shell.tsx`

判断：

- **[高]** V3 页面骨架已经成形。

### 4.2 路由迁移层

`apps/web/next.config.ts` 当前包含以下过渡重定向：

- `/chat -> /app`
- `/settings -> /connect`
- `/dashboard -> /app`
- `/usage -> /app`
- `/providers -> /connect`
- `/x-accounts -> /connect`
- 以及 `topics / drafts / learning / media / publish-queue / reply-queue / workflow / audit` 等兼容跳转

判断：

- **[高]** V3 已有明确迁移层，不是硬切。
- **[中]** 这说明当前仍处于“兼容旧入口”的过渡期。

### 4.3 V3 API 壳层

当前已存在控制器路由：

- `POST /v3/session/bootstrap`
- `POST /v3/chat/run`
- `GET /v3/chat/runs/:id`
- `GET /v3/chat/runs/:id/stream`（SSE）
- `POST /v3/connections/x-self`
- `POST /v3/connections/x-target`
- `POST /v3/connections/obsidian`
- `POST /v3/connections/local-files`
- `POST /v3/connections/urls`
- `GET /v3/profile`
- `POST /v3/profile/rebuild`
- `POST /v3/publish/prepare`
- `POST /v3/publish/confirm`
- `GET /v3/queue`
- `GET /v3/billing/plans`
- `POST /v3/billing/checkout`

判断：

- **[高]** V3 不是只有前端外壳，已经有成体系的 API 表达。

### 4.4 V3 服务层能力

`apps/api/src/modules/v3/v3.service.ts` 已实现：

- bootstrap session 聚合
- 单句 intent -> prompt envelope -> generation start
- generation step 到 V3 stage 的映射
- stream/run/detail 聚合
- 连接自己的 X 账号、目标账号、Obsidian、本地文件、URL
- profile 读取与 rebuild
- publish prepare / confirm
- queue 聚合
- billing plans / checkout 透传

判断：

- **[高]** V3 服务层已经完成“把旧模块编排成 V3 交互契约”的第一版。

## 5. 最新本地 UAT 证明了什么

证据文件：

- `UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`
- `artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/009-browser-routes.json`

已确认通过：

- `auth.me`
- `v3.billing.plans`
- `v3.bootstrap`
- `v3.profile`
- `v3.queue`
- `v3.chat.run`
- `v3.chat.stream`
- `v3.chat.detail`
- browser capture

UAT 还显示：

- 默认 X 账号：未连接
- 学习来源数：0
- 待确认 / 已排队：1 / 0
- `/chat` 会落到 `/app`
- `/settings` 会落到 `/connect`
- `/dashboard`、`/usage` 会落到 `/app`
- `/providers`、`/x-accounts` 会落到 `/connect`

判断：

- **[高]** V3 最小生成链路和新页面壳已能在本地跑通。
- **[中]** 当前 UAT 更像“operator shell smoke + generation proof”，而不是“全功能 V3 验收”。

## 6. 当前明显成立的优点

### 6.1 壳层方向清晰

- 首页、Operator、Connect、Queue 分工明确
- 视觉和文案已经切到 “X AI Operator” 叙事

### 6.2 状态面比 V2 更一致

- `LoadingState / ErrorState / EmptyState / SuccessNotice` 已抽成通用反馈组件
- `operator-app.tsx`、`connect-page.tsx`、`queue-page.tsx` 都在用统一状态反馈

### 6.3 V3 是编排层，不是重复造轮子

- `v3.service.ts` 调用的仍是已有 `generate / learning-sources / history / publish / billing / x-accounts` 等模块
- 这让 V3 更像“产品壳重组”，而不是新建平行系统

## 7. 当前缺口与混合状态

### 7.1 仍存在 V2/V3 混合依赖

例子：

- `apps/web/lib/queries.ts` 中，X OAuth 绑定回调仍调用：

```ts
/v2/x-accounts/oauth/callback
```

判断：

- **[高]** V3 前端壳还在复用 V2 callback API。
- 这不一定是 bug，但它明确说明“V3 尚未完成完全切割”。

### 7.2 错误页和 404 文案仍残留“聊天中枢”

文件：

- `apps/web/app/error.tsx`
- `apps/web/app/not-found.tsx`

现状：

- 文案仍写“回到聊天中枢”
- 链接仍指向 `/chat`

判断：

- **[高]** 功能上不阻断，因为 `/chat` 已重定向到 `/app`
- **[高]** 但产品语言已经与 V3 operator 叙事不一致

### 7.3 本地 UAT 没覆盖所有 V3 mutation

已覆盖：

- bootstrap / profile / queue / run / stream / detail / browser routes

未在本轮本地 UAT 中证明的关键动作：

- `connections/x-self`
- `connections/x-target`
- `connections/obsidian`
- `connections/local-files`
- `connections/urls`
- `profile/rebuild`
- `publish/prepare`
- `publish/confirm`
- `billing/checkout`

判断：

- **[高]** 这些端点“代码存在”，但还不能仅凭这轮 UAT 就说“已端到端验证完毕”。

### 7.4 V3 仍未形成新的生产发布证据

- 当前发布报告只确认到 V2 生产上线
- 当前 V3 证据仍是本地 UAT 和工作树代码

判断：

- **[高]** 目前不能把 V3 描述成“已上线状态”

## 8. 当前评审结论（可操作）

### 可认为“已成立”的部分

- V3 产品方向
- V3 页面壳
- V3 基础 API 契约
- 本地最小生成链路
- API tests / API typecheck / Web typecheck

### 不能直接认为“已完成”的部分

- V3 全功能端到端可用
- V3 生产可发布
- V2 依赖已完全切除
- V3 文案与异常态已全部完成收口

## 9. 建议的下一步

1. **先做 V3 收口，不急着再扩功能**
   - 把 `/chat` 话术彻底改成 `/app` / Operator 语言
   - 清理 error / not-found 等残留文案

2. **补 V3 关键 mutation 验证**
   - connect 系列
   - publish prepare / confirm
   - profile rebuild
   - billing checkout

3. **单独做一次“V3 可提交评审”**
   - 把当前 working tree 中哪些该保留、哪些该拆分、哪些还不该合并讲清楚

## 10. 最终判断

- **事实**：V3 已经是可运行原型，不再只是 spec。
- **事实**：它已经通过了本地 UAT 的最小闭环证明，并且当前 API tests、API typecheck、Web typecheck 都通过。
- **事实**：它仍处于“混合 cutover + 在制状态”，还不是一个可以直接宣称“已完成发布候选”的版本。
