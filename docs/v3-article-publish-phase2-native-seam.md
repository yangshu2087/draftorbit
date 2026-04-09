# V3 Article Publish Phase 2 Native Seam

> 状态：设计稿 / 未实现  
> 更新时间：2026-04-08  
> 适用仓库：`/Users/yangshu/.codex/worktrees/draftorbit-article-publisher`

## Summary

Phase 2 的目标不是改变用户主路径，而是把 article 发布 transport 从：

- `manual_x_web`

升级为未来可能的：

- `native_x_api`

同时保持 `/app` 作为唯一主入口，并让 UI 只根据 capability 渲染不同动作。

## Capability contract

```ts
type ArticlePublishMode = 'manual_x_web' | 'native_x_api';

type ArticlePublishAvailability = 'available' | 'blocked' | 'degraded';

type ArticlePublishNextAction = 'export_article' | 'publish_article';

type ArticlePublishCapability = {
  mode: ArticlePublishMode;
  availability: ArticlePublishAvailability;
  nextAction: ArticlePublishNextAction;
  nativeApiAvailable: boolean;
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

## Provider seam

建议引入统一 provider：

```ts
interface XArticlePublisherProvider {
  getCapability(userId: string): Promise<ArticlePublishCapability>;
  prepare(runId: string, userId: string): Promise<{ capability: ArticlePublishCapability }>;
  publish?(runId: string, userId: string): Promise<ArticlePublishResult>;
  recordManualCompletion?(
    runId: string,
    userId: string,
    url: string,
    xAccountId?: string,
  ): Promise<ArticlePublishRecordResult>;
}
```

### Phase 2 provider 划分

1. `ManualXWebArticlePublisher`
   - 当前默认 provider
   - 提供 manual export 能力
   - 支持回填链接记录

2. `NativeXApiArticlePublisher`
   - 未来 provider
   - 仅在公开 API、scope、feature flag 与账号状态全部满足时启用

## UI 映射规则

### 当 `mode = manual_x_web`

- 主 CTA：`复制并去 X 发布`
- nextAction：`export_article`
- 面板动作：复制正文 / 打开 X / 粘贴链接 / 保存结果

### 当 `mode = native_x_api`

- 主 CTA：`直接发布到 X`
- nextAction：`publish_article`
- 面板动作：文章预览 / 风险确认 / 发布 / 成功态

### 当 `availability = blocked`

仍在 `/app` 内处理：

- 未绑定 X → `connect_x_self`
- scope 不足 → `reconnect_x_permissions`
- provider 不可用 → 降级回 `manual_x_web`

## 数据迁移方向

当前技术债：

- article 完成记录仍复用了 tweet 语义字段

建议迁移目标：

```ts
publishKind: 'x_post' | 'x_article';
publishMode: 'manual_x_web' | 'native_x_api';
externalRef: string | null;
externalUrl: string | null;
completionSource: 'manual_record' | 'native_api';
```

### 迁移步骤

1. Phase 2a：双写新旧字段
2. Phase 2b：前端与 V3 接口读新优先
3. Phase 2c：移除 tweet-specific 过载字段

## 升级前提

只有以下条件全部满足，才允许进入 `native_x_api`：

- 公开文档明确提供可用的 article publish endpoint
- DraftOrbit 已完成 scope / account / failure-mode 验证
- 可以维持 `/app` 单入口与 nextAction 模式
- 浏览器与 API UAT 有独立 evidence 证明可用

## 非目标

- 不在没有公开能力的前提下伪造 native publish
- 不设计自动浏览器代发
- 不把 article 发布重新做成单独后台页
