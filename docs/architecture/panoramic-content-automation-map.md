# DraftOrbit 全景结构图映射：智能内容与自动化中枢

> 当前阶段：第一阶段结构化升级。目标不是复制企业级大屏，而是把参考图中的分层思想落到 DraftOrbit 当前可交付的 X 内容运营链路中。

## 1. 抽象原则

参考图的核心不是“模块越多越好”，而是把内容平台拆成稳定的数据流与控制流：

1. 用户/角色提出任务；
2. 接入层把 URL、X、文件、未来连接器统一为来源；
3. 数据采集与治理保证事实、去噪、去重、脱敏；
4. 智能中枢做策略、模型路由、上下文、视觉规划与质量判断；
5. 内容生成层产出文本、图文、HTML/Markdown/bundle；
6. 工作流把结果转为人工确认、队列、导出和后续动作；
7. 监控/商业生态记录使用、审计、套餐入口和 provider/live evidence；
8. 所有真实外部动作保持安全边界。

DraftOrbit 的第一阶段落点是：**用 `operationSummary` 把一次生成 run 的数据源、治理、智能编排、资产和工作流状态合成一个可复用的中枢摘要**，同时在 `/app` 与 `/projects` 展示给普通运营用户。

## 2. 参考图 12 层 → DraftOrbit 8 个产品域

| 参考图层级 | DraftOrbit 产品域 | 当前已有能力 | 本轮第一阶段实现 | 后续预留 |
| --- | --- | --- | --- | --- |
| 用户层 | `User / Workspace / XAccount / local session` | 本机体验、X 连接入口、workspace scoped API | 中枢摘要按 workspace/run/project 展示，不暴露 provider 调试细节 | 多角色、团队权限、企业 SSO |
| 接入层 | X OAuth、local session、URL、local files、future connectors | X 连接、URL source、local knowledge 入口 | `operationSummary.dataSources` 把 URL/X/local/manual 状态统一表达 | 小红书/微信公众号/CRM/Drive 等 connector |
| 数据采集层 | `SourceCaptureService / LearningSources / History` | baoyu/direct fetch URL capture、学习来源 | 中枢摘要区分 source ready/missing/failed/skipped | 批量采集、变更监听、来源版本化 |
| 数据治理层 | source validation、dedupe、metadata scrub、quality gate | latest fail-closed、metadata leak gate、source-grounded fallback | `operationSummary.governance` 输出 sourceStatus、qualityStatus、hardFails 和用户文案 | 专门治理队列、治理评分、可追溯引用图谱 |
| 智能中枢 | model routing、strategy、memory/context、visual planning、decision scheduling | GPT/Codex-first 路由、视觉规格、项目上下文 | `operationSummary.intelligence` 显示策略/生成/视觉/修复/done 的用户级阶段 | 多策略 A/B、长期记忆、自动调度 |
| 内容生成层 | tweet/thread/article/diagram/social pack + SVG/Markdown/HTML bundle | `/app`、`/v4`、视觉资产、导出包 | 中枢摘要把 ready/failed/bundle 状态统一给 UI | Raster provider、高级品牌模板、批量图文包 |
| 工作流与执行层 | project runs、drafts、manual publish prep、queue | `/projects`、`PublishJob`、queue、safe publish prep | `operationSummary.workflow.nextActions` 统一下一步动作：补来源、重写、重试资产、复制、下载、准备发布、连接 X | 自动排程、审批流、跨渠道执行 |
| 监控商业生态层 | usage、audit、billing safe entry、provider/live evidence | UsageLog、AuditLog、pricing/connect/queue 入口 | UI 仅展示运营摘要；provider/route 细节继续留在后台/报告 | BI 看板、成本优化、团队套餐、SLA 指标 |

## 3. 新增运行阶段摘要：`operationSummary`

本轮默认不新增公开路由，复用现有 V3/V4 run preview。`operationSummary` 是 run result 内的结构化摘要：

```ts
type OperationSummary = {
  dataSources: Array<{
    kind: 'url' | 'x' | 'local_file' | 'search' | 'manual';
    status: 'ready' | 'missing' | 'failed' | 'skipped';
    label: string;
  }>;
  governance: {
    sourceStatus: 'ready' | 'required' | 'failed' | 'not_required';
    qualityStatus: 'passed' | 'blocked' | 'warning';
    hardFails: string[];
    userMessage: string;
  };
  intelligence: {
    stage: 'strategy' | 'generation' | 'visual_planning' | 'repair' | 'done';
    userFacingSummary: string;
  };
  workflow: {
    publishMode: 'manual_confirm';
    queueStatus: 'not_queued' | 'pending_confirm' | 'queued';
    nextActions: Array<'add_source' | 'rewrite_from_source' | 'retry_visual_assets' | 'copy_markdown' | 'download_bundle' | 'prepare_publish' | 'open_project' | 'connect_x'>;
  };
  assets: {
    ready: number;
    failed: number;
    bundleReady: boolean;
  };
};
```

### 用户可见边界

- 展示：来源是否可用、质量是否通过、图文资产是否 ready、下一步动作是什么。
- 不展示：provider stderr、raw prompt、模型 fallback、token、调试标签、内部 prompt wrapper。
- 安全边界：真实 X 发布、支付、OAuth 最终授权仍只进入人工确认或安全入口。

## 4. 前端落点

### `/app`

- 保持“一句话生成”主路径。
- 生成完成后自动滚动到结果区；顶部显示 `结果已生成，查看下方结果` 锚点，避免用户以为结果没有显示。
- 结果区新增 `智能中枢概览`：数据源、治理、智能中枢、工作流、图文资产五张轻卡。
- 下一步动作以普通用户文案展示：`补充来源`、`基于来源重写`、`重试图文资产`、`复制 Markdown`、`下载图文包`、`准备发布`、`连接 X`。

### `/projects`

- 保持项目运营主体验：项目目标、受众、内容支柱、来源、视觉风格、发布安全清单。
- 新增 `全景中枢概览`：未生成时显示项目上下文/来源/待启动状态；生成后复用 run 的 `operationSummary`。
- 项目页仍不暴露模型路由或 provider 调试细节。

## 5. 后端/API 证据通道

- API contract：不新增公开路由，复用 `GET /v3/chat/runs/:id` 与 V4 preview wrapper。
- Error semantics：保留 `SOURCE_REQUIRED`、`QUALITY_GATE_BLOCKED`、`MODEL_PROVIDER_UNAVAILABLE`、`FORBIDDEN_WORKSPACE`、`ASSET_NOT_FOUND` 等既有语义。
- Permissions：workspace-scoped project/run 不变；asset download 仍走 signed URL 或 workspace ownership。
- Data consistency：DB/result 只存 metadata/checksum/provider evidence；大体积 artifacts 留在 ignored local roots。
- Observability：`UsageLog` / `AuditLog` 保留后台观测；普通 UI 不展示 provider/prompt/debug。

## 6. Rollout / rollback

- Rollout：本分支先把 `operationSummary` 输出并在 `/app`、`/projects` 消费；保留原结果预览、资产、queue/connect/pricing 入口。
- Rollback：移除 UI 消费和 helper，或不读取 `operationSummary`；现有 `/app`、`/projects`、V3/V4 API 仍可运行。
- 风险：过度抽象导致 UI 术语企业化；本轮限制为“中枢摘要 + 下一步动作”，不做复杂 BI 大屏。

## 7. 第一阶段未实现模块

- 完整 BI 指标看板、企业 IAM、跨渠道 CRM、真实自动发布、真实扣费、批量调度和多团队审批流。
- 这些能力后续应作为独立产品/架构阶段，而不是混入本轮 UI。
