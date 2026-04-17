# DraftOrbit V2 GitHub/Google 竞品对标矩阵（2026-04-07）

> 结论口径：只做**模式借鉴 + 自研实现**，不直接拷贝第三方业务代码。
> 元信息来源：2026-04-05 通过 GitHub 仓库 API / 仓库页查询到的 license、archived、description 等字段。

## 评估规则
- **P0**：两周内可以直接转成 DraftOrbit 的页面 / API / 交互规范。
- **P1**：重要能力，适合并行做，但要先完成 P0 的主链路。
- **P2**：参考价值存在，但不应抢占前两周核心产能。
- 任何仓库：如果 license 不清晰、功能强耦合、依赖旧 SDK / bot 生态、或偏离 X-first / API-first 原则，均只做模式参考。

## A组：平台级 / 完整产品（优先借鉴）
| 序号 | 仓库 | 许可证 / 状态 | 核心可借鉴点 | 为何不直接搬代码 | 落地优先级 |
|---:|---|---|---|---|---|
| 1 | [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | AGPL-3.0 · 活跃 | 多账号排程、AI 辅助、工作区、发布队列、日历、重试 | AGPL-3.0；功能很全，但 Laravel/队列/权限/前端耦合极深，直接搬会把 DraftOrbit 锁死在它的工程边界里。 | P0 |
| 2 | [inovector/mixpost](https://github.com/inovector/mixpost) | MIT · 活跃 | 自托管发布、Buffer 式队列、账号/内容管理、无订阅的 self-host 体验 | MIT；代码可读但强绑定其 Laravel 数据层与产品流，适合借鉴界面和排程模型，不适合原样复用。 | P0 |
| 3 | [inovector/MixpostApp](https://github.com/inovector/MixpostApp) | 未声明 · 活跃 | 开箱即用的安装分发与包预置 | 未声明许可证；本质是 Mixpost Lite 的分发壳，价值在部署体验，不在核心业务代码。 | P1 |
| 4 | [TechSquidTV/Shoutify](https://github.com/TechSquidTV/Shoutify) | Apache-2.0 · 已归档 | 自托管、免费、社媒管理的轻量信息架构 | Apache-2.0；且已归档，维护已停，更适合拿来对照功能分层，不适合直接依赖。 | P2 |
| 5 | [sanjipun/socialring](https://github.com/sanjipun/socialring) | MIT · 活跃 | 社媒管理平台的简洁内容流与团队协作雏形 | MIT；项目体量小、实现偏早期，直拷会带来更多重构成本。 | P1 |
| 6 | [cameronking4/ReplyGuy-clone](https://github.com/cameronking4/ReplyGuy-clone) | 未声明 · 活跃 | 关键词抓取、回复建议、AI 生成回复、按日程执行 | 未声明许可证；强依赖抓取/回复链路和其产品假设，必须重写成 DraftOrbit 的合规回复助手。 | P0 |
| 7 | [langchain-ai/social-media-agent](https://github.com/langchain-ai/social-media-agent) | MIT · 活跃 | human-in-the-loop 的 sourcing / curation / scheduling 工作流骨架 | MIT；agent graph 的流程组织方式很有启发，但其图结构和依赖库不应直接搬。 | P0 |
| 8 | [renefatuaki/influencer-ai](https://github.com/renefatuaki/influencer-ai) | 未声明 · 活跃 | Docker 化、Spring Boot + Spring AI、调度 + Next.js 前端的分层 | 未声明许可证；技术栈完全不同，借鉴的是工程分层和容器化习惯，不是实现。 | P1 |
| 9 | [Prem95/socialautonomies](https://github.com/Prem95/socialautonomies) | MIT · 活跃 | X API + auto-post / reply / engage 的完整闭环 | MIT；包含 browser-cookie 自动化思路，与 DraftOrbit 的 API-first 合规路径冲突，且账号风险高。 | P1 |

## B组：X / Twitter 自动化与调度（能力借鉴）
| 序号 | 仓库 | 许可证 / 状态 | 核心可借鉴点 | 为何不直接搬代码 | 落地优先级 |
|---:|---|---|---|---|---|
| 10 | [john88188/x-poster](https://github.com/john88188/x-poster) | 未声明 · 活跃 | markdown 驱动的自动发帖、排程、轻量操作台 | 未声明许可证；工具很薄，直接复制收益有限，更适合重写成 DraftOrbit 的 publish adapter。 | P0 |
| 11 | [Xquik-dev/tweetclaw](https://github.com/Xquik-dev/tweetclaw) | MIT · 活跃 | 开放式端点、背景轮询、读写一体的自动化入口 | MIT；端点很多但与 OpenClaw 平台强耦合，直接搬会把 DraftOrbit 绑定到外部调用协议。 | P1 |
| 12 | [garyb9/twitter-llm-bot](https://github.com/garyb9/twitter-llm-bot) | MIT · 活跃 | LLM 生成 + 异步调度 + contextual content | MIT；更像 bot 原型，缺少审核与工作区边界，需要改造成有人审的 drafting pipeline。 | P1 |
| 13 | [vjgpt/twitter-pipeline](https://github.com/vjgpt/twitter-pipeline) | 未声明 · 活跃 | Airflow DAG / pipeline 式编排 scheduler | 未声明许可证；依赖 Airflow 概念，工程栈偏重，适合作为 workflow 分层参考。 | P1 |
| 14 | [minimaxir/twitter-cloud-run](https://github.com/minimaxir/twitter-cloud-run) | MIT · 活跃 | 可水平扩展的定时 bot 运行方式 | MIT；设计目标是无限 bot，而 DraftOrbit 需要账号隔离、审批和可观测，不宜照搬。 | P1 |
| 15 | [christianotieno/scheduled-tweets](https://github.com/christianotieno/scheduled-tweets) | 未声明 · 活跃 | Buffer clone 式 scheduling + post 管理 | 未声明许可证；产品思路接近，但实现往往较旧，需以 DraftOrbit 的 API 和 UI 重新设计。 | P0 |
| 16 | [redianmarku/twitter-scheduler](https://github.com/redianmarku/twitter-scheduler) | 未声明 · 活跃 | 桌面端排程 + 自动上传 | 未声明许可证；Tkinter/桌面耦合太强，不能直接迁移到 Web 工作台。 | P0 |
| 17 | [rixx/thread-scheduler](https://github.com/rixx/thread-scheduler) | 未声明 · 活跃 | thread 级排程、串帖组织 | 未声明许可证；功能单一，适合作为 draft/thread 模型的局部灵感，不适合整仓复用。 | P0 |
| 18 | [alexyoung/twitter-scheduler](https://github.com/alexyoung/twitter-scheduler) | 未声明 · 活跃 | 简单排程与自动发布的最小可行接口 | 未声明许可证；过薄，最好只借鉴命令/数据形态。 | P1 |
| 19 | [mvkro1/Twitter-Auto-Poster](https://github.com/mvkro1/Twitter-Auto-Poster) | 未声明 · 活跃 | 自动发帖 + 定时调度 | 未声明许可证；bot 化很强，直接复用会让 DraftOrbit 偏离审批发布原则。 | P0 |
| 20 | [lewispour/Twitter-auto-Post-Bot---X.com---Tweepy-python-bot](https://github.com/lewispour/Twitter-auto-Post-Bot---X.com---Tweepy-python-bot) | MIT · 活跃 | Tweepy 命令式自动化、从文件/字符串/日程发帖 | MIT；Python bot 适合借鉴输入形态，但 Tweepy / 脚本式实现过于脆弱。 | P1 |
| 21 | [Adetona/AutoTweet](https://github.com/Adetona/AutoTweet) | MIT · 活跃 | 最小 scheduled tweet bot 模型 | MIT；功能太窄，只能参考任务模型。 | P1 |
| 22 | [nanbhas/NotionToTwitter](https://github.com/nanbhas/NotionToTwitter) | Apache-2.0 · 活跃 | 内容源 → 帖子 → 定时发布 的 intake 模式 | Apache-2.0；强绑定 Notion 作为来源，DraftOrbit 需要更通用的 learning-source / brief 链路。 | P0 |
| 23 | [achetronic/twitter-mcp](https://github.com/achetronic/twitter-mcp) | Apache-2.0 · 活跃 | MCP 化的 read / write / analyze / schedule 工具边界 | Apache-2.0；协议层可借鉴，但工具契约、权限和数据模型必须重写。 | P0 |
| 24 | [riensen/Auto-GPT-Twitter-Plugin](https://github.com/riensen/Auto-GPT-Twitter-Plugin) | MIT · 活跃 | agent plugin 形态、自动发帖插件接口 | MIT；依赖 Auto-GPT 旧生态，插件边界和安全模型都与 DraftOrbit 不同。 | P1 |

## C组：互动 / 运营扩展（中优先）
| 序号 | 仓库 | 许可证 / 状态 | 核心可借鉴点 | 为何不直接搬代码 | 落地优先级 |
|---:|---|---|---|---|---|
| 25 | [typefully/agent-skills](https://github.com/typefully/agent-skills) | MIT · 活跃 | drafting + scheduling 的 agent skills 包装、任务分工 | MIT；Typefully 特定，且 skill 机制应转化为 DraftOrbit 内部 playbook，不直接拷贝。 | P0 |
| 26 | [ahmadawais/typefully-cli](https://github.com/ahmadawais/typefully-cli) | MIT · 活跃 | CLI + agent skill 的最小操作面 | MIT；多平台 CLI 更适合借鉴命令 UX，而不是代码实现。 | P1 |
| 27 | [gitroomhq/postiz-agent](https://github.com/gitroomhq/postiz-agent) | NOASSERTION · 活跃 | Claude / OpenClaw 等 agent 接入排程的桥接思路 | NOASSERTION；而且它只是 Postiz 的 agent 外挂，DraftOrbit 需要自己的 provider hub 和 job adapter。 | P0 |
| 28 | [gitroomhq/postiz-n8n](https://github.com/gitroomhq/postiz-n8n) | MIT · 活跃 | n8n custom node 的连接器式编排 | MIT；n8n 节点只是外部编排适配，不是 DraftOrbit 内核。 | P1 |
| 29 | [Crell/mastobot](https://github.com/Crell/mastobot) | AGPL-3.0 · 活跃 | 个人账号定时发帖 bot 的轻量调度 discipline | AGPL-3.0；且面向 Mastodon，网络与受众不同，只能借鉴节奏，不能移植业务。 | P1 |
| 30 | [meseta/curatebot](https://github.com/meseta/curatebot) | MIT · 活跃 | curated → scheduled publish 的简洁 flow | MIT；Vue / Firebase 架构与 DraftOrbit 栈差异大，适合借鉴 curation 模式。 | P1 |
| 31 | [Mark-H/twitterwall](https://github.com/Mark-H/twitterwall) | 未声明 · 活跃 | 高曝光展示面、公告 / 赞助提示的墙式视图 | 未声明许可证；面向 conference wall，与 DraftOrbit 的内容生产主链路不在同一优先级。 | P2 |
| 32 | [SpaceCoastDevs/PostVector](https://github.com/SpaceCoastDevs/PostVector) | 未声明 · 活跃 | Buffer / Hootsuite-like 多用户共享排程概念 | 未声明许可证；概念接近但工程信息少，优先只借鉴共享视图，不押注实现。 | P2 |
| 33 | [terrytangyuan/social-media-kit](https://github.com/terrytangyuan/social-media-kit) | MIT · 活跃 | 多平台格式化、tagging、reminder、OAuth、cross-platform posting | MIT；覆盖面很宽，但 DraftOrbit 只取 X-first 的子集，避免被多平台复杂度拖慢。 | P0 |

## D组：部署与自托管运营（工程借鉴）
| 序号 | 仓库 | 许可证 / 状态 | 核心可借鉴点 | 为何不直接搬代码 | 落地优先级 |
|---:|---|---|---|---|---|
| 34 | [gitroomhq/postiz-docker-compose](https://github.com/gitroomhq/postiz-docker-compose) | AGPL-3.0 · 活跃 | self-host 安装包、compose 启动、dev/prod 一致性 | AGPL-3.0；是部署壳，不是产品内核，应该学习交付体验而非直接依赖。 | P0 |
| 35 | [gitroomhq/postiz-helmchart](https://github.com/gitroomhq/postiz-helmchart) | Apache-2.0 · 活跃 | K8s / Helm 的发布和参数化部署表达 | Apache-2.0；属于运维封装，和 DraftOrbit 业务逻辑可分离。 | P1 |
| 36 | [macagua/mixpost_docker](https://github.com/macagua/mixpost_docker) | MIT · 活跃 | Docker 安装路径、卷 / 环境变量 / 自托管体验 | MIT；这是部署打包层，适合借鉴安装步骤，不适合拷贝业务代码。 | P0 |

## 复用边界结论
- **能复用的是模式**：队列、日历、审批、工作区、多账号、MCP / agent / n8n、Docker 自托管、素材 / draft / publish 流。
- **不能复用的是实现**：仓库中的路由、服务层、数据模型、插件契约、账号授权、抓取 / cookies / bot 细节。
- **DraftOrbit 的执行原则**：把这些仓库当作“行为样本”和“界面样本”，然后在 DraftOrbit 的 `/x-accounts`、`/drafts`、`/publish-queue`、`/reply-queue`、`/workflow`、`/usage`、`/ops/dashboard` 上自研落地。

## 12 行可执行摘要
1. 先做 `/drafts`、`/publish-queue`、`/ops/dashboard` 三件事，保证主链路可理解。
2. 自托管与安装体验优先参考 Postiz / Mixpost，但代码只做模式迁移。
3. 回复助手优先参考 ReplyGuy / socialautonomies / twitter-mcp，但必须改成审批制。
4. 学习引擎优先参考 social-media-agent / influencer-ai / typefully 系列。
5. 排程与队列优先参考 x-poster / scheduled-tweets / thread-scheduler / twitter-scheduler。
6. 任何 browser-cookie 或网页脚本自动化，只保留为对照，不进入主路径。
7. 任何无明确 license 的仓库，只做界面与流程启发，不复制代码。
8. 归档仓库只做历史参考，不作为核心依赖。
9. `/learning`、`/voice-profiles`、`/playbooks` 是 DraftOrbit 的差异化区。
10. `/media`、`/naturalization`、`/providers` 是把 AI 产出变成可发内容的关键层。
11. `/workflow` 负责把 agent / n8n / MCP 思路收口到可审计的工作流。
12. 所有高风险动作仍然保留人审、重试、回滚、审计日志。


## Google 搜索补充（产品级参考）
- Typefully pricing / positioning（用作 C 端文案与定价锚点）
- TweetHunter onboarding flow（用作 Chat-first 首屏引导参考）
- Taplio feature messaging（用作“增长目标 → 内容包”表达参考）
- Hypefury autopilot copy（用作自动化功能解释参考）

> 以上仅用于信息架构和功能表达借鉴，不做品牌或代码复制。
