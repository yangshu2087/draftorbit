# DraftOrbit Article Publish 设计稿

- 日期：2026-04-08
- 适用仓库：`/Users/yangshu/.codex/worktrees/draftorbit-article-publisher`
- 当前分支：`codex/v3-abc-pr`
- 文档定位：article 发布链路的事实说明 + 升级位点设计

## Summary

这份设计稿解决两件事：

1. **A：article 专项 docs / PR 附图收口**
   - 让 reviewer、后续 agent、未来新会话能快速理解当前 article 的真实用户路径、已验证行为与证据位置。
2. **B：native X Article publisher 升级位点设计**
   - 明确 `manual_x_web` 与未来 `native_x_api` 的 capability seam、状态约束、UI 映射与数据迁移方向。

这份文档不伪造现状。当前真实可用路径仍然是：

> 生成长文 → 复制正文 → 打开 X 网页端发布 → 把最终文章链接贴回 DraftOrbit → 系统记录为已发布

## Goal

把 article 能力从“已能手动导出 + 已有零散证据”收束成两个可评审成果：

1. repo 内有一份清晰的 article source-of-truth 文档与附图说明。
2. 系统内有一份明确的 native article publish seam 设计，使未来一旦 X 公布公开发布能力，可以低摩擦切换，而不破坏 `/app` 的单入口体验。

## Constraints

- 当前真实可用路径仍是 **manual_x_web**。
- 截至 **2026-04-08**，官方公开文档层面：
  - X Help Center 文档化了 Articles 的网页使用流：<https://help.x.com/en/using-x/articles>
  - 当前公开 X Developer 文档导航中，没有看到公开 Articles publish endpoint：
    - <https://developer.x.com/en/docs/twitter-api>
    - <https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/migrate>
- 上述“未看到公开 publish endpoint”属于**基于当前官方公开文档的推断**，不是对私有/未公开能力的否定。
- `/app` 继续是唯一主入口；不新增后台感页面。
- `nextAction` 可以扩展，但不能重新引入多主入口心智。
- 必须复用现有设计系统、现有按钮/卡片/任务面板模式。
- 设计必须覆盖 loading / empty / error / hover / focus-visible / disabled 等状态。

## Non-goals

- 不声称已经接通原生 X Article API 发布。
- 不设计自动浏览器代发。
- 不重做 tweet/thread 发布链路。
- 不新增新的顶级页面入口。
- 不在本设计稿中展开 pricing、账户体系或计费策略。

## Done Criteria

这份设计稿完成时，必须能回答：

1. repo 内哪几份文档是 article source of truth。
2. PR 描述与 repo 文档如何分工。
3. `manual_x_web` 到 `native_x_api` 的切换点在哪里。
4. `/app` 内 article 的 CTA、任务面板、已发布状态如何随 capability 变化。
5. 哪些表字段/接口命名现在是技术债，Phase 2 如何迁移。
6. 后续实现阶段应该跑哪些测试与浏览器验收。

## 当前已验证事实

### 已真实验证的用户路径

当前 `/app` 内 article 路径已经能做到：

- 选择 `article` 输出形态
- 生成符合 X 长文结构的正文
- 结果区显示导出引导
- 用户复制长文并跳去 X 网页端发布
- 用户粘贴最终文章链接
- DraftOrbit 调用 `POST /v3/publish/article/complete` 记录发布结果
- queue / run detail 中该条 article 从 review 转为 published

### 当前已存在的证据

专项 UAT 报告：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-ARTICLE-REPORT-uat-article-2026-04-08_23-38-21-483.md`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-EVIDENCE-INDEX-uat-article-2026-04-08_23-38-21-483.md`

专项 UAT 产物目录：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/artifacts/uat-full/uat-article-2026-04-08_23-38-21-483/`

本地浏览器附图：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png`

### 当前视觉基线说明

1. **result-flow**
   - 长文结果区展示“复制 → 打开 X → 回填链接”的三步路径。
2. **result-saved**
   - 用户保存文章链接后，结果区进入“已记录发布链接”状态。
3. **task-panel-saved**
   - `export_article` 任务面板在已记录状态下不再催促发布，而是允许用户关闭并继续下一条。

## 方案比较

### 方案 1：只补 docs / PR 附图，不做 native seam 设计

**优点**
- 成本最低
- 交付快

**缺点**
- 只能回答“现在怎么跑”，不能回答“未来怎么升级”
- 后续一旦接入原生能力，仍需重新开架构讨论

**结论**
- 不推荐。

### 方案 2：A 做成 repo 内证据入口，B 做成 capability seam 设计

**优点**
- 同时解决“当前事实收口”和“未来升级位点”
- 不伪造 native 已可用
- 保持 `/app` 单入口与当前产品叙事一致

**缺点**
- 文档更长，需要明确当前的技术债与迁移方向

**结论**
- **推荐方案**。

### 方案 3：直接以 native publisher 名义设计实现，再回头补文档

**优点**
- 看起来更激进

**缺点**
- 与当前公开事实不匹配
- 很容易演变成“假发布器”
- reviewer 无法判断哪些是已验证事实，哪些只是愿景

**结论**
- 不推荐。

## A. Article docs / PR 附图收口设计

### A1. Source of truth 分层

#### 1) 面向产品/工程总览
建议新增：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md`

用途：
- 作为 article 当前真实能力说明书
- 回答：
  - 当前用户路径
  - 为什么当前采用 `manual_x_web`
  - 哪些行为已验证
  - 哪些仍未实现
  - 未来 native seam 在哪里

推荐章节：
1. Summary
2. 当前真实用户路径
3. 为什么当前采用 `manual_x_web`
4. 已完成行为清单
5. 已验证证据索引
6. 已知限制
7. 升级到 `native_x_api` 的前提

#### 2) 面向专项验收
继续保留并增强：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-ARTICLE-REPORT-uat-article-2026-04-08_23-38-21-483.md`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-EVIDENCE-INDEX-uat-article-2026-04-08_23-38-21-483.md`

用途：
- 承载“这次专项 UAT 实际跑了什么”
- 不承担架构总览角色

#### 3) 面向 PR reviewer 的极简摘要
PR body 继续保留，但只负责：
- 这次 PR 新增了什么
- 为什么这样做
- 证据链接在哪里

**分工原则**
- PR body 讲结论
- repo docs 讲细节
- UAT 报告讲证据

### A2. 附图收口规范

建议把这 3 张图视为正式 evidence 资产：
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png`

每张图在 phase1 文档中配 1 句 caption：
- `article-result-flow.png`：长文结果区展示“复制 → 打开 X → 回填链接”的三步路径。
- `article-result-saved.png`：用户保存文章链接后，结果区进入“已记录发布链接”状态。
- `article-task-panel-saved.png`：`export_article` 任务面板在已记录状态下不再催促发布，而是允许用户关闭并继续下一条。

### A3. 文案与状态规范（manual_x_web）

#### 结果区文案
- 主按钮：`复制并去 X 发布`
- 次按钮：`只复制长文`
- 输入框 label：`发布后把文章链接贴回来`
- 成功反馈：`文章链接已记录`
- 成功说明：`这篇长文已被记录为已发布，后续可继续生成下一条。`

#### 任务面板文案
- 标题：`先把长文发到 X 网页端`
- 描述：`复制长文，打开 X 网页端完成发布，再把文章链接贴回来。`
- 成功态文案：`这篇长文的发布链接已记录。现在可以关闭面板，继续生成下一条。`

### A4. UI 状态要求（manual_x_web）

#### loading
- 结果区显示 skeleton，不出现错误性空白
- `保存文章链接` 按钮 disabled
- 任务面板使用轻量 loading 文案：`正在检查这条长文的发布状态…`

#### empty
- 未生成 article 前，不显示回填输入框
- 只显示一句说明：`生成长文后，这里会出现发布步骤。`

#### error
- URL 非法：`请输入有效的 X 文章链接`
- 保存失败：`这次记录失败了，你可以直接重试，不会影响已生成内容`
- 失败时不清空用户输入

#### disabled
- 没有 article 正文时，复制按钮 disabled
- URL 为空或非法时，保存按钮 disabled

#### hover / focus-visible
- 复用现有主按钮 tokens
- 输入框 focus-visible 与当前 `/app` 表单一致
- 链接 hover 下划线明确，不引入新风格

## B. Native X Article publisher capability seam 设计

### B1. 设计原则

**用户视角保持不变，发布 transport 可替换。**

也就是：
- 用户仍在 `/app`
- 用户仍只关心“下一步”
- 系统内部根据 capability 决定：
  - 是手动网页发布
  - 还是原生 API 发布

前台不把 transport 细节变成新的产品复杂度。

### B2. Capability 模型

建议收束成：

```ts
type ArticlePublishMode = 'manual_x_web' | 'native_x_api';

type ArticlePublishAvailability =
  | 'available'
  | 'blocked'
  | 'degraded';

type ArticlePublishNextAction =
  | 'export_article'
  | 'publish_article';

type ArticlePublishCapability = {
  mode: ArticlePublishMode;
  availability: ArticlePublishAvailability;
  nextAction: ArticlePublishNextAction;
  description: string;
  openUrl?: string;
  reasonCode?:
    | 'NO_PUBLIC_API'
    | 'MISSING_X_ACCOUNT'
    | 'MISSING_SCOPE'
    | 'FEATURE_FLAG_OFF'
    | 'PROVIDER_UNAVAILABLE';
};
```

#### 字段意图
- `mode`：当前走哪种 transport
- `availability`：当前能不能执行
- `nextAction`：前端打开哪个任务面板
- `reasonCode`：可测试、可观测、可解释

### B3. Provider seam

Phase 2 应正式引入 provider 抽象，而不是把 article 条件分支继续堆在 `V3Service` / `PublishService` 中。

```ts
interface XArticlePublisherProvider {
  getCapability(userId: string): Promise<ArticlePublishCapability>;
  prepare(runId: string, userId: string): Promise<ArticlePublishPreparation>;
  publish?(runId: string, userId: string): Promise<ArticlePublishResult>;
  recordManualCompletion?(
    runId: string,
    userId: string,
    url: string,
  ): Promise<ArticlePublishRecordResult>;
}
```

#### 初始 provider
1. `ManualXWebArticlePublisher`
   - 当前默认 provider
   - 支持：`getCapability`、`prepare`、`recordManualCompletion`
   - 不支持 direct publish

2. `NativeXApiArticlePublisher`
   - 未来 provider
   - 仅在公开能力、scope、账号状态都满足时启用

### B4. 前端映射规则

#### 当 `mode = manual_x_web`
- 主 CTA：`复制并去 X 发布`
- `nextAction`：`export_article`
- 任务面板展示：
  - 复制正文
  - 打开 X
  - 粘贴链接
  - 保存成功态

#### 当 `mode = native_x_api`
- 主 CTA：`直接发布到 X`
- `nextAction`：`publish_article`
- 任务面板展示：
  - 文章预览
  - 风险检查
  - 发布确认
  - 发布成功状态

#### 当 `availability = blocked`
仍然在 `/app` 内处理，不新增页面：
- 未绑定 X 账号 → `connect_x_self`
- scope 不足 → `reconnect_x_permissions`
- provider 不可用 → 自动降级回 `manual_x_web`

### B5. 数据模型升级方向

#### 当前技术债
当前 article 手动发布结果，临时复用了 tweet 语义字段，例如把 article URL 写入 tweet-like 外部字段。Phase 1 可以接受，但不应继续扩大。

#### 推荐迁移目标

```ts
publishKind: 'x_post' | 'x_article'
publishMode: 'manual_x_web' | 'native_x_api'
externalRef: string | null
externalUrl: string | null
completionSource: 'manual_record' | 'native_api'
```

#### 迁移策略
- **Phase 2a：双写**
  - 新写入走新字段
  - 旧字段保留兼容读取
- **Phase 2b：读新优先**
  - 前端、queue、run detail 优先读新字段
  - 旧字段只做 fallback
- **Phase 2c：收债**
  - article 与 tweet 路径稳定后，逐步移除 tweet-specific 过载

### B6. `nextAction` 设计

建议新增内部动作：
- `publish_article`

保留现有：
- `export_article`

#### 不复用 `confirm_publish` 的原因
- tweet/thread 的确认发布与 article 的发布确认交互不同
- 强行共用会让 UI 变成条件分支泥团
- 但它仍然只是 `/app` 内部任务面板动作，不是新页面

### B7. UI 状态要求（native_x_api）

#### loading
- 文案：`正在检查发布权限…`
- 发布按钮 disabled

#### empty
- 若文章未达到最小结构要求：`这篇内容还不像一篇完整 X 长文，先补齐后再发布`

#### error
- scope 缺失：`当前 X 授权不包含文章发布所需权限，请重新连接账号`
- provider 失败：`这次直发失败，已切回网页端发布方式`

#### disabled
- 未通过风控检查时 disabled
- 未确认风险提示时 disabled

#### hover / focus-visible
- 与 tweet 发布确认按钮视觉一致
- 不引入“文章专用按钮风格”

## 交付物建议

如果进入下一步实现，建议正式落两份文档：

1. `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md`
   - 当前真实能力说明书
   - 面向 reviewer / 新 agent / 未来接手者

2. `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase2-native-seam.md`
   - capability seam / state contract / migration 设计
   - 面向后续实现

## 实现阶段的验证要求

```bash
npx pnpm@10.23.0 --filter @draftorbit/shared build
npx pnpm@10.23.0 --filter @draftorbit/db prisma:generate
npx pnpm@10.23.0 --filter @draftorbit/api test
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npx pnpm@10.23.0 --filter @draftorbit/api build
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/node_modules/.bin/tsx --test /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-result-copy.test.ts
```

浏览器验收基线：
- 375 / 768 / 1024 / 1440
- `/app` article 生成
- manual export 保存文章链接
- native capability mock/on/off 两组状态
- console errors = 0

## 结论

推荐按“**A：证据与文档收口 + B：native seam 先设计后实现**”推进。

原因：
- A 解决“现在能力到哪一步、证据在哪”的问题
- B 解决“以后接原生能力时，会不会把 `/app` 与 publish 体系重新搞乱”的问题
- 该路径不伪造能力，不让产品叙事与技术现状脱节
- 同时为未来可能出现的公开 Articles publish 能力留出清晰升级点
