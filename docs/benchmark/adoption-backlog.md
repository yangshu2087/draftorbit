# DraftOrbit adoption backlog（2026-04-05）

> 目标：把 36 个对标仓库的模式，转成 DraftOrbit **两周内可落地** 的产品/页面/API 任务。
> 口径：**模式借鉴 + 自研实现，不直接拷贝**；P0 先打主链路，P1 补齐体验与能力，P2 放到 2 周之后。

## 2 周节奏（建议执行顺序）
| 天数 | 目标 | 交付物 |
|---|---|---|
| Day 1-2 | P0：统一理解性壳层 | `workbench-shell`、页面态、错误卡、`/ops/dashboard` 入口、`/usage/overview` 入口 |
| Day 3-4 | P0：X 账号 + 草稿主链路 | `/x-accounts`、`/drafts`、`/topics`、质量门控、审批按钮 |
| Day 5-6 | P0：发布队列 + 重试 | `/publish-queue`、`/publish/jobs`、`/publish/jobs/:id/retry`、`/ops/queues` |
| Day 7 | P0：验收与回归 | smoke / browser verify / requestId 对照 / audit 追踪 |
| Day 8-10 | P1：学习引擎与风格层 | `/learning`、`/voice-profiles`、`/playbooks`、`/naturalization` |
| Day 11-12 | P1：回复与素材 | `/reply-queue`、`/media`、`/workflow` |
| Day 13-14 | P1 收口 + P2 冻结 | `/providers`、`/usage`、`/audit` 稳定化，P2 排队到下周期 |

## P0
| 任务 | 参考仓库 | DraftOrbit 页面 | DraftOrbit API | 2 周内验收标准 |
|---|---|---|---|---|
| 统一壳层与页面状态合同 | postiz-app / mixpost / social-media-agent / social-media-kit | /dashboard, /ops/dashboard, /x-accounts, /topics, /drafts, /publish-queue, /usage, /audit | GET /ops/dashboard, GET /usage/overview, GET /audit/logs, GET /audit/summary | 所有功能页都显示 loading / empty / error / ready；错误卡包含 requestId、重试和下一步。 |
| X 账号绑定与工作区 bootstrap | postiz-app / mixpost / twitter-mcp | /x-accounts, /settings, /providers | GET /x-accounts, POST /x-accounts/bind-manual, POST /x-accounts/oauth/start, GET /x-accounts/oauth/callback, POST /workspaces/bootstrap, GET /providers | 至少能完成 1 个 X 账号绑定、设为默认、刷新 token、展示状态。 |
| Draft Studio + 质量门控 | ReplyGuy-clone / social-media-agent / typefully/agent-skills / x-poster | /topics, /drafts | GET /topics, POST /topics, GET /drafts, POST /drafts, POST /drafts/:id/quality-check, POST /drafts/:id/approve, POST /generate/start, GET /generate/history | 无自由文本也能从选题模板进入草稿、通过质量检查、进入审批。 |
| 发布队列 + 定时 + 重试 | postiz-app / mixpost / x-poster / scheduled-tweets / thread-scheduler / twitter-scheduler | /publish-queue | POST /publish/draft, POST /publish/tweet, POST /publish/thread, GET /publish/jobs, GET /publish/jobs/:publishJobId, POST /publish/jobs/:publishJobId/retry, GET /ops/queues | 能看到排队、失败、重试、成功回写，并且每条任务都可追踪。 |
| Ops dashboard + 运行证据 | postiz-app / social-media-kit / postiz-agent | /ops/dashboard, /usage, /audit | GET /ops/dashboard, GET /usage/summary, GET /usage/overview, GET /usage/events, GET /audit/logs | dashboard 上能看见 requestId、blockingReason、nextAction 与降级说明。 |
| Workflow preview + run history | social-media-agent / postiz-agent / twitter-mcp | /workflow | GET /workflow/templates, POST /workflow/templates, POST /workflow/templates/:id/run, GET /workflow/runs, GET /workflow/operation-templates, POST /workflow/presets/pipeline/run | 用户能看到流程预览而不是黑盒触发，并能回看 run 历史。 |

## P1
| 任务 | 参考仓库 | DraftOrbit 页面 | DraftOrbit API | 2 周内验收标准 |
|---|---|---|---|---|
| 学习引擎 + Voice Profile + Playbook | social-media-agent / influencer-ai / socialautonomies / typefully-cli | /learning, /voice-profiles, /playbooks | GET /learning-sources, POST /learning-sources, POST /learning-sources/:id/run, GET /history/style, POST /history/analyze, GET /voice-profiles, POST /voice-profiles, PATCH /voice-profiles/:id, GET /playbooks, POST /playbooks | 能从历史帖子 / 文本样本学习风格，并把结果挂到账号级 voice profile。 |
| Naturalization + media packaging | postiz-app / mixpost / social-media-kit / mixpost_docker | /naturalization, /media | POST /naturalization/preview, GET /media, POST /media/upload-placeholder, POST /media/generate-placeholder, PATCH /media/:id/link-draft | 草稿可预览自然化前后差异，媒体能以“可直接发布素材包”状态挂回草稿。 |
| Reply queue + candidate review | ReplyGuy-clone / socialautonomies / twitter-llm-bot / Auto-GPT-Twitter-Plugin | /reply-queue | GET /reply-jobs, POST /reply-jobs/sync-mentions, POST /reply-jobs/:id/candidates, POST /reply-jobs/:id/candidates/:candidateId/approve, POST /reply-jobs/:id/send | 候选回复有风险等级和审批理由，发送前必须有人审。 |
| Provider Hub + BYOK routing | twitter-mcp / typefully-cli / postiz-agent | /providers, /settings | GET /providers, GET /providers/byok-status, POST /providers, PATCH /providers/:id/toggle, POST /providers/route-text | 支持把不同任务路由到不同 provider，并展示 BYOK 状态。 |
| 自托管安装与部署体验 | postiz-docker-compose / postiz-helmchart / mixpost_docker | /settings, /pricing | GET /auth/local/session, GET /billing/plans, GET /billing/subscription, GET /billing/usage | 自托管说明、启动脚本、环境变量与最小闭环文档能让用户 30 分钟内跑起来。 |

## P2
| 任务 | 参考仓库 | DraftOrbit 页面 | DraftOrbit API | 何时做 |
|---|---|---|---|---|
| 跨平台 / Notion / 任务墙式扩展 | NotionToTwitter / mastobot / twitterwall / curatebot / PostVector | /workflow, /settings | POST /history/analyze, POST /workflow/presets/pipeline/run, GET /usage/trends | 只在核心链路稳定后，把多平台或展示型扩展作为加分项。 |
| 更细的共享协作与多用户分析 | socialring / Shoutify / MixpostApp | /dashboard, /usage, /audit | GET /workspaces/me, GET /usage/trends, GET /audit/summary | 当多账号、多工作区、团队协作真的出现需求再做。 |

## 交付原则
- 先实现“看得懂”，再谈“更自动化”。
- 任何高风险动作都保留人工审批、重试与审计。
- `/x-accounts`、`/drafts`、`/publish-queue`、`/reply-queue` 是两周内必须打通的主轴。
- `/learning`、`/voice-profiles`、`/playbooks`、`/naturalization`、`/media` 是第二阶段的体验增强。
- `/providers`、`/usage`、`/audit` 先做可观测与可解释，不追求花哨。
