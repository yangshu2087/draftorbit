# DraftOrbit 项目入口版

> 更新时间：2026-04-08  
> 当前项目根路径：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io`

## 30 秒理解项目

- DraftOrbit 当前最可信的产品定义是 **X AI Operator**。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`
- 它不是通用 AI Chat，也不是复杂多后台 SaaS。它卖的是：**一句话任务 → 自动研究/起草/风控 → 可发布的 X 内容结果包**。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-ux-flow.md`
- 项目已经经历三阶段：**V1 workbench → V2 chat-first → V3 operator-first**。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/AUDIT-REPORT-2026-04-02.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v2-product-spec.md`、`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/docs/v3-product-spec.md`

## 当前状态一句话

- **已发布事实**：V2 chat-first 已在 2026-04-07 完成生产发布与 UAT。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/output/reports/release/UAT-PROD-RELEASE-REPORT-2026-04-07.md`
- **当前在制状态**：V3 页面壳、`/v3/*` API 和本地 V3 UAT 已出现，但仍在当前脏工作树中推进。  
  证据：`/Volumes/AI_SSD/04-projects-large/openclaw-workspace/projects/021-draftorbit.io/UAT-FULL-REPORT-uat-v3-2026-04-08_10-19-20-258.md`、git 工作树检查（2026-04-08）

## 先读这 5 份

1. `README.md`  
   作用：技术栈、启动方式、仓库级说明。
2. `docs/v3-product-spec.md`  
   作用：当前产品定义。
3. `docs/v3-ux-flow.md`  
   作用：当前主页面壳、迁移规则和用户流程。
4. `docs/knowledge-recovery-2026-04-08.md`  
   作用：完整项目记忆恢复档案。
5. `docs/v3-status-review-2026-04-08.md`  
   作用：当前 V3 在制实现的状态评审。

## 如果你只关心“现在该信什么”

### 产品方向

- 优先信 `docs/v3-product-spec.md`
- V2 文档用于解释“为什么会从 workbench 收束到 operator-first”

### 已发布状态

- 优先信 release / UAT / performance 报告
- 不要把当前工作树误认为已经全部上线

### 当前在制改造

- 优先看：
  - `apps/api/src/modules/v3/*`
  - `apps/web/app/app/page.tsx`
  - `apps/web/app/connect/page.tsx`
  - `apps/web/app/queue/page.tsx`
  - `apps/web/components/v3/*`

## 当前仓库基线

- 技术栈：Next.js / NestJS / Prisma / BullMQ / PostgreSQL / Redis / Tauri shell  
  证据：`README.md`、`apps/desktop/README.md`
- 当前工作分支：`codex/design-md-rollout`
- 当前 HEAD：`dacb836f78ec85382ddd6a8ac567c4509ff702f7`
- 当前主分支：`main` → `cbdbdf48c00cb641b0a4e862b8ef435c11ea82be`

## 目前最缺的恢复内容

- **未找到历史聊天逐字稿**  
  这份入口和知识恢复包恢复的是“项目知识”，不是“原会话文本”。  
  证据：`memory/` 为空、`/Volumes/AI_SSD/05-docs-media/documents-archive/021-draftorbit.io` 为空、未发现 transcript/conversation 导出

## Article publish

- `docs/v3-article-publish-phase1.md`  
  作用：当前 article 真实能力、证据入口与正确用户路径。
- `docs/v3-article-publish-phase2-native-seam.md`  
  作用：未来 native article publish 的 capability seam、UI 映射与数据迁移设计。

## 关联文档

- 完整恢复包：`docs/knowledge-recovery-2026-04-08.md`
- 路径与索引收口清单：`docs/path-index-reconciliation-checklist-2026-04-08.md`
- V3 状态评审：`docs/v3-status-review-2026-04-08.md`
