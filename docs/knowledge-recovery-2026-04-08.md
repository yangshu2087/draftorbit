# DraftOrbit 知识恢复包（2026-04-08）

> 当前项目根路径（唯一真实根路径）：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io`
>
> 本包是**恢复项目上下文**的事实档案，不包含不可验证的旧对话原文，也不伪造“之前对话中说过什么”。

## 使用说明

- **用途**：给新会话、新 agent、未来的维护者提供一份可追溯的项目记忆基线。
- **定位**：这不是聊天备份；这是基于仓库文档、发布/UAT 报告、原始 artifacts、git 历史和文件系统观察重建出来的项目知识入口。
- **证据优先级**：`正式文档 > 发布/UAT 报告 > 原始 artifacts > git 历史 > 推断`
- **结论标注**：
  - **[高]**：有直接文档、报告或原始证据支撑
  - **[中]**：有多份间接证据交叉支撑
  - **[推断]**：基于已有证据做出的合理解释，非直接原文事实

## 1. Executive Summary

- **[高]** DraftOrbit 当前最可信的产品定位是 **X AI Operator**，而不是通用 AI Chat 工具，也不是多模块 SaaS 后台。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- **[高]** 产品已经经历了三阶段演进：**V1 工作台（workbench）→ V2 chat-first → V3 operator-first**。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/AUDIT-REPORT-2026-04-02.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-product-spec.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- **[高]** 当前 north star 是：用户用一句话表达目标，系统自动研究、学习、起草、做风险检查，并输出**可发布的 X 内容结果包**；真实发帖默认人工确认。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`
- **[高]** 当前技术栈仍是：`web / api / worker / postgres / redis / tauri shell`，前端为 Next.js，后端为 NestJS，队列为 BullMQ。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/README.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/desktop/README.md`
- **[高]** 生产计费主通道已经明确为 Stripe，且做过真实 live 演练（取消订阅、部分退款、全额退款）。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/STRIPE-SETUP-2026-04-04.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/BILLING-OPS-SOP.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/billing/BILLING-LIVE-DRILL-2026-04-04.md`
- **[高]** `codex/design-md-rollout` 分支 HEAD 已包含 V2 收敛和性能优化提交，但当前工作树仍然是**脏的**，并且包含一批尚未提交的 V3 改造。  
  证据：git 历史与工作树检查（2026-04-08）；相关未提交路径见第 7 节
- **[高]** 当前仓库内已经存在 V3 文档、V3 路由、`/v3/*` API 模块和本地 V3 UAT 报告，说明 V3 已不是纯概念，而是**在制实现**。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`
- **[高]** 旧的 V1 页面在 2026-04-07 那轮已被物理删除，而不是长期通过重定向保留。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`
- **[高]** 旧聊天逐字稿目前不可恢复；仓库内 `memory/` 为空，外部文档归档目录也为空，未发现 conversation/transcript 导出。  
  证据：文件系统检查（2026-04-08）；`/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io/` 为空；仓库 `memory/` 为空
- **[高]** SSD 迁移已完成，但很多文档和报告仍然引用旧路径 `/Users/yangshu/.openclaw/...`，说明“路径迁移”完成了，**文档收口**尚未完成。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/README.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/uat-full/*.md`
- **[中]** 当前最需要的恢复内容不是更多产品 spec，而是：**项目记忆入口、路径统一、V3 状态评审、性能稳定性复核**。  
  证据：V3 文档已存在；性能报告显示通过率退化；路径引用大量未收口；旧聊天原文缺失

## 2. 可恢复证据源清单

### 2.1 仓库正式文档

已找到：

- 仓库入口：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/README.md`
- 设计约束：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/DESIGN.md`
- Web 设计与验收约束：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/web/DESIGN.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/web/docs/ui-acceptance-checklist.md`
- 产品/UX/成本文档：
  - `.../docs/v2-product-spec.md`
  - `.../docs/v2-ux-flow.md`
  - `.../docs/v2-cost-margin-model.md`
  - `.../docs/v2-retrospective-2026-04-07.md`
  - `.../docs/v3-product-spec.md`
  - `.../docs/v3-ux-flow.md`
  - `.../docs/v3-cost-margin-model.md`

说明：

- **[高]** 仓库正式文档足以恢复“产品方向”和“演进脉络”。
- **[高]** V3 文档已经进入仓库，说明当前方向已切到 operator-first。

### 2.2 报告类文档

已找到：

- 审计报告：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/AUDIT-REPORT-2026-04-02.md`
- 计费/运营文档：
  - `.../BILLING-OPS-SOP.md`
  - `.../STRIPE-SETUP-2026-04-04.md`
- 发布与验收报告：
  - `.../output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-05.md`
  - `.../output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`
  - `.../output/reports/acceptance/W1-ACCEPTANCE-REPORT-2026-04-05.md`
- 性能报告：
  - `.../output/reports/performance/p0-performance-prelaunch-comparison-2026-04-07.md`
  - `.../output/reports/performance/p0-performance-prod-validation-2026-04-07.md`
- UAT 报告：
  - `.../output/reports/uat-full/UAT-FULL-REPORT-uat-2026-04-07_12-39-35-581.md`
  - `.../UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`

说明：

- **[高]** 报告类文档足以恢复“某个日期发生了什么”和“是否进入发布/UAT/性能验证阶段”。
- **[高]** V3 的最新本地 UAT 报告已经出现，说明 V3 至少完成了最小端到端本地验证。

### 2.3 原始执行证据（artifacts）

已找到：

- V1/V2 全量 UAT 原始响应：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat/...`
- V3 本地 UAT 原始响应：
  - `.../artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/006-post-v3-chat-run.json`
  - `.../artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/007-stream-v3-416364e5-0503-4f9f-88b8-932d930625cc.json`
  - `.../artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/008-get-v3-chat-runs-416364e5-0503-4f9f-88b8-932d930625cc.json`
  - `.../artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/009-browser-routes.json`

说明：

- **[高]** artifacts 能恢复“API 实际返回了什么”和“页面实际有哪些路由与文案壳层”。
- **[高]** V3 当前不是只有 spec；它已经能返回 `runId`、SSE 事件、结果包和浏览器截图。

### 2.4 Git 证据

已找到：

- 当前工作分支：`codex/design-md-rollout`
- 当前 HEAD：`a8d35bcd21fc63061520a54ecdd52cb5c69466a3`
- 当前 `main`：`cbdbdf48c00cb641b0a4e862b8ef435c11ea82be`
- 最近关键提交（节选）：
  - `2026-04-07 a8d35bc perf(api): cut generate latency with fast-path and routing timeouts`
  - `2026-04-07 9998314 feat(v2): improve chat guidance, explainability and knowledge onboarding`
  - `2026-04-07 190a803 feat(v2): remove v1 UI surface and harden prod uat automation`
  - `2026-04-05 729f5cb feat: ship full-flow uat orchestration and production hardening`
  - `2026-04-04 952012c feat(billing): ship live Stripe 3-tier pricing and cutover tooling`

说明：

- **[高]** git 足以恢复“什么时候改了方向、什么时候上线、什么时候做了性能优化”。
- **[高]** git 也确认当前树并非干净基线，而是正在进行中的 V3 转向工作面。

### 2.5 外部迁移目录

已找到：

- RAG 源文档镜像：`/Volumes/AI_SSD/02-ai-workbench/rag/source-docs/021-draftorbit.io`
- 图片归档：`/Volumes/AI_SSD/05-docs-media/images/021-draftorbit.io`

已确认为空或缺失：

- 文档归档目录：`/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io`（空）
- 仓库 `memory/` 目录（空）

未发现：

- 可直接恢复的聊天 transcript / conversation dump / transcript export

明确结论：

- **[高]** 未发现可直接恢复的历史聊天 transcript。

结论：

- **[高]** 外部迁移目录已经存在，但只完成了**部分资产迁移**。
- **[高]** 当前没有找到历史聊天逐字稿的落盘位置。

## 3. 项目时间线（按日期恢复）

### 2026-04-02：V1 工作台基础版收敛完成

- 做了什么：
  - 登录 → Topic → Draft → 审批 → Publish Queue → Worker 回写 → Audit 主链路被认定为打通
  - 阶段 B/C 模块也已补到“可运行基础版”
- 为什么重要：
  - 这证明项目早期是**工作台式多页面产品**，不是从一开始就 chat-first
- 对今天意味着什么：
  - 所有 V2/V3 文档都应被理解为**在 V1 已可运行基础上的再定位和再收敛**
- 证据：
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/AUDIT-REPORT-2026-04-02.md`

### 2026-04-04：Stripe / billing 真链路与运营 SOP 成形

- 做了什么：
  - Stripe 三档定价、试用策略、price id、webhook、payment method domain 等正式化
  - 完成 live billing 演练和日常运营 SOP 文档
- 为什么重要：
  - 这说明商业化不是纸面设计，而是已经进入“可运营”阶段
- 对今天意味着什么：
  - 计费相关判断应优先信任 `BILLING-OPS-SOP`、`STRIPE-SETUP`、billing 报告，而不是旧口头记忆
- 证据：
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/STRIPE-SETUP-2026-04-04.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/BILLING-OPS-SOP.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/billing/BILLING-LIVE-DRILL-2026-04-04.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/billing/BILLING-TEST-REPORT-2026-04-04.md`

### 2026-04-05：V1 工作台生产发布与全真实 UAT 通过

- 做了什么：
  - 生产发布完成
  - V1/W1 主链路、3 账号路由回放、dashboard/usage 页面回归都通过
- 为什么重要：
  - 说明 V1 并不是中途废弃草稿，而是有过真实上线与验收
- 对今天意味着什么：
  - V1 文档和 UAT 报告仍然是恢复历史事实的重要依据，尤其适用于解释“为什么会有那么多旧模块名”
- 证据：
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/acceptance/W1-ACCEPTANCE-REPORT-2026-04-05.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-05.md`

### 2026-04-07：V2 chat-first 改造、V1 物理删除、性能收敛与上线验证

- 做了什么：
  - 产品收敛到 `/chat` 为主入口的 chat-first 体验
  - V1 旧页面被物理清理
  - 性能优化将 generate P50 大幅压缩
  - 同时生产验证发现稳定性退化
- 为什么重要：
  - 这一天是“产品方向切换”与“性能/稳定性 tradeoff”同时发生的关键节点
- 对今天意味着什么：
  - 任何关于 V2 的判断，都要区分：
    - V2 方向是成立的
    - 但性能优化后的稳定性曾经出过问题
- 证据：
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-product-spec.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-retrospective-2026-04-07.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/performance/p0-performance-prelaunch-comparison-2026-04-07.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/performance/p0-performance-prod-validation-2026-04-07.md`

### 2026-04-08：V3 operator-first 路由与 `/v3/*` API 在本地 UAT 成形

- 做了什么：
  - 新页面壳出现：`/`, `/app`, `/queue`, `/connect`, `/pricing`
  - 新 API 模块出现：`/v3/*`
  - 本地 V3 UAT 已跑通一轮
- 为什么重要：
  - 说明 V3 已从 spec 进入实际代码与本地验收阶段
- 对今天意味着什么：
  - 当前项目状态应理解为：**V2 已发布，V3 正在工作树中推进**
- 证据：
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`
  - `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/009-browser-routes.json`

## 4. 产品认知恢复：DraftOrbit 现在到底是什么

### 4.1 不是什么

- **[高]** 不是通用 AI Chat 套件
- **[高]** 不是“模块越多越好”的多后台 SaaS
- **[中]** 也不再以“复杂工作台信息架构”作为主卖点

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`

### 4.2 是什么

- **[高]** 它是一个面向 X 的 **AI Operator**
- **[高]** 面向中文优先用户
- **[高]** 目标不是“聊天本身”，而是把聊天输入收束为**可发内容结果包**

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`

### 4.3 用户承诺

- 一句话目标输入
- 自动研究与证据收集
- 自动匹配文风、生成草稿和配图建议
- 形成可发布结果包
- 默认人工确认后再真实发帖

结论：

- **[高]** DraftOrbit 当前最重要的产品承诺是“更省心的 X 运营结果包”，不是“更自由的聊天界面”。

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`

### 4.4 V2 与 V3 的差异

| 项目 | V2 | V3 |
|---|---|---|
| 主入口 | `/chat` | `/app` |
| 对外表达 | chat-first 内容运营助手 | X AI Operator |
| 核心页面壳 | `/chat` + `/settings` + `/pricing` | `/` + `/app` + `/queue` + `/connect` + `/pricing` |
| 用户感知重点 | 简化生成流程 | 一句话任务 → 结果包 → Queue 确认 |

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`

## 5. 系统与工程基线

### 5.1 技术栈与部署形态

- Web：Next.js + TypeScript + Tailwind
- API：NestJS + Prisma
- Worker：BullMQ + Redis
- DB：PostgreSQL
- Desktop：Tauri 壳
- Monorepo：pnpm workspace + turbo

结论：

- **[高]** 当前工程基线没有改成多微服务；仍然是单仓多应用、单产品面部署模型。

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/README.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/desktop/README.md`

### 5.2 主要模块边界

当前 API 模块可见：

- `auth`
- `x-accounts`
- `generate`
- `publish`
- `reply-jobs`
- `billing`
- `usage`
- `audit`
- `v2`
- `v3`

结论：

- **[高]** V2 与 V3 目前是并存模块，而不是已经完全完成切换。

证据：

- 文件系统检查（2026-04-08）
- `apps/api/src/modules/v2`
- `apps/api/src/modules/v3`

### 5.3 当前事实状态

- 当前工作分支：`codex/design-md-rollout`
- 当前 HEAD：`a8d35bcd21fc63061520a54ecdd52cb5c69466a3`
- `main` 当前指向：`cbdbdf48c00cb641b0a4e862b8ef435c11ea82be`
- 工作树状态：**存在大量未提交变更**

结论：

- **[高]** 当前仓库不是“稳定干净基线”；它包含一批正在推进的 V3 变更。

证据：

- git 检查（2026-04-08）

## 6. 当前在制变更快照（V3）

### 6.1 新增中的能力

当前 working tree 正在引入：

- 新 API：
  - `apps/api/src/modules/v3/v3.controller.ts`
  - `apps/api/src/modules/v3/v3.dto.ts`
  - `apps/api/src/modules/v3/v3.module.ts`
  - `apps/api/src/modules/v3/v3.service.ts`
- 新页面：
  - `apps/web/app/app/page.tsx`
  - `apps/web/app/connect/page.tsx`
  - `apps/web/app/queue/page.tsx`
- 新 V3 组件：
  - `apps/web/components/v3/home-page.tsx`
  - `apps/web/components/v3/operator-app.tsx`
  - `apps/web/components/v3/connect-page.tsx`
  - `apps/web/components/v3/queue-page.tsx`
  - `apps/web/components/v3/shell.tsx`
- 新支撑文件：
  - `apps/api/src/common/cors.ts`
  - `apps/web/components/ui/state-feedback.tsx`
  - `apps/web/lib/ui-error.ts`

### 6.2 正在删减或替换的旧壳层

当前 working tree 同时删除或替换：

- `apps/web/app/chat/page.tsx`
- `apps/web/app/settings/page.tsx`
- `apps/web/components/chat/chat-workspace.tsx`
- `apps/web/components/workspace/history-list.tsx`
- `apps/web/components/workspace/reasoning-panel.tsx`
- `apps/web/components/workspace/result-card.tsx`
- `apps/web/components/icons/x-logo.tsx`

### 6.3 同步调整中的脚本与共享层

- `scripts/uat-full.mjs`
- `scripts/preflight-prod.sh`
- `scripts/release-prod.sh`
- `apps/web/lib/queries.ts`
- `apps/web/lib/sse-stream.ts`
- `packages/shared/src/types.ts`

结论：

- **[高]** 这是一个“路由壳 + API + 脚本 +共享类型”同时推进的 V3 转向。
- **[高]** 这些变更是**当前在制快照**，不是已发布生产事实。

证据：

- git 工作树检查（2026-04-08）
- 文件系统检查（2026-04-08）

## 7. 文档地图与推荐阅读顺序

### 7.1 推荐首次阅读顺序

1. `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/README.md`  
   用途：仓库入口、技术栈、启动方式、当前公开交付范围
2. `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`  
   用途：当前产品定义
3. `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`  
   用途：当前页面职责与 operator-first UX 壳
4. `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-cost-margin-model.md`  
   用途：当前成本/毛利守门逻辑
5. `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-retrospective-2026-04-07.md`  
   用途：解释为什么从 V1/V2 继续往 V3 收束
6. 最新发布/UAT/性能报告  
   用途：判断哪些已经上线，哪些只是当前工作树中的改造

### 7.2 关键文档的作用

- `README.md`：工程入口
- `docs/v3-product-spec.md`：当前产品定位
- `docs/v3-ux-flow.md`：当前主页面壳与迁移规则
- `docs/v3-cost-margin-model.md`：当前成本模型
- `docs/v2-retrospective-2026-04-07.md`：方向转向解释材料
- `output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`：V2 已发布事实
- `UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`：V3 在制验证事实
- `BILLING-OPS-SOP.md`：运营手册

### 7.3 历史文档但仍有价值

- `docs/benchmark/github-competitor-matrix-2026-04-05.md`
- `docs/benchmark/github-competitor-matrix-v2.md`
- `docs/benchmark/adoption-backlog.md`
- `DraftOrbit 系统架构第二轮.rtf`

结论：

- **[高]** V1/V2 历史资料仍有价值，但它们的作用更偏“解释来路”和“提供约束来源”，不是当前产品的最终表达。

## 8. 迁移与路径问题清单

### 8.1 已知不一致

- 文档中仍大量引用旧路径：`/Users/yangshu/.openclaw/workspace/projects/021-draftorbit.io`
- 当前真实根路径已经变为：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io`
- RAG source docs 目前只同步到了 V2 相关资料
- 文档归档目录为空

### 8.2 影响

- 新 agent 看到旧路径时，容易误判项目真实位置
- RAG 如果继续依赖旧镜像，可能拿不到 V3 文档
- 一些历史报告的绝对路径会继续指向旧位置，降低可追溯性

结论：

- **[高]** 迁移本身已完成，但**路径与索引收口**还没完成。

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/README.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/README.md`
- `/Volumes/AI_SSD/02-ai-workbench/rag/source-docs/021-draftorbit.io`
- `/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io`

## 9. 未决问题与风险

### 9.1 旧聊天原文不可恢复

- 状态：**未解决**
- 风险：未来可能把“项目知识恢复”误当成“聊天备份恢复”
- 推荐下一步：如果你本地或外部平台还有 conversation export，需要单独导回并建立索引

### 9.2 V3 是否已达到“可提交/可发布”仍需单独评审

- 状态：**未解决**
- 风险：当前仓库同时包含已发布 V2 事实和未提交 V3 改造，容易混淆
- 推荐下一步：单独做一次 V3 working tree 状态评审，明确“哪些完成、哪些待做、哪些不该合入”

### 9.3 性能优化后的稳定性曾退化，需重新核验当前分支是否已修复

- 状态：**未解决**
- 风险：2026-04-07 的生产验证里，速度大幅提升，但通过率从 100% 降到 33.33%
- 推荐下一步：对当前分支重新做生成链路稳定性核验

证据：

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/performance/p0-performance-prod-validation-2026-04-07.md`

### 9.4 路径迁移后的文档引用、RAG 镜像、报告索引未完全收口

- 状态：**未解决**
- 风险：后续任何依赖路径的自动化都会拿到混合状态
- 推荐下一步：做一次“路径与索引收口”专项整理

## 10. 附录

### 10.1 关键文件索引

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/README.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/DESIGN.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/web/DESIGN.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/apps/web/docs/ui-acceptance-checklist.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-ux-flow.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-retrospective-2026-04-07.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-cost-margin-model.md`

### 10.2 关键报告索引

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/AUDIT-REPORT-2026-04-02.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/BILLING-OPS-SOP.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/STRIPE-SETUP-2026-04-04.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/acceptance/W1-ACCEPTANCE-REPORT-2026-04-05.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-05.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/performance/p0-performance-prelaunch-comparison-2026-04-07.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/performance/p0-performance-prod-validation-2026-04-07.md`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`

### 10.3 关键 artifacts 索引

- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/006-post-v3-chat-run.json`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/007-stream-v3-416364e5-0503-4f9f-88b8-932d930625cc.json`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/008-get-v3-chat-runs-416364e5-0503-4f9f-88b8-932d930625cc.json`
- `/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/artifacts/uat-full/uat-v3-2026-04-08_10-19-20-258/responses/009-browser-routes.json`

### 10.4 git 提交时间线摘要

- `2026-04-03 381b026 chore: bootstrap DraftOrbit deployment repo`
- `2026-04-04 952012c feat(billing): ship live Stripe 3-tier pricing and cutover tooling`
- `2026-04-04 66a33a1 fix(billing): unblock Stripe subscription checkout in live mode`
- `2026-04-04 cbdbdf4 chore(api): remove temporary billing probe route`
- `2026-04-04 3bddbfb chore(design): scaffold DESIGN.md workflow for repo and web app`
- `2026-04-05 729f5cb feat: ship full-flow uat orchestration and production hardening`
- `2026-04-07 190a803 feat(v2): remove v1 UI surface and harden prod uat automation`
- `2026-04-07 9998314 feat(v2): improve chat guidance, explainability and knowledge onboarding`
- `2026-04-07 a8d35bc perf(api): cut generate latency with fast-path and routing timeouts`

### 10.5 当前外部目录位置索引

- RAG source docs：`/Volumes/AI_SSD/02-ai-workbench/rag/source-docs/021-draftorbit.io`
- 文档归档：`/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io`
- 图片归档：`/Volumes/AI_SSD/05-docs-media/images/021-draftorbit.io`

---

## 结尾说明

- **事实**：本包能恢复 DraftOrbit 的产品脉络、工程基线、发布历史和当前 V3 在制状态。
- **未知**：本包不能恢复已丢失的逐字聊天原文。
- **推断**：如果后续要继续稳定接手本项目，最有价值的下一步不是再写一份 spec，而是做一次 **V3 状态评审 + 路径与索引收口**。
