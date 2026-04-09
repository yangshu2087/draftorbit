# DraftOrbit Article Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the article publish Phase 1 docs/evidence entry and the Phase 2 native capability seam without changing the current truthful user path: generate in `/app`, publish on X web today, and upgrade to a native article transport later behind the same `/app` experience.

**Architecture:** Keep `/app` as the only user-facing entry. Normalize article publish capability in `packages/shared`, route API decisions through a dedicated article publisher seam in `apps/api`, and move article-specific UI decisions into focused web helpers/components so manual-web and future native publish can share one surface with different transports.

**Tech Stack:** TypeScript, Next.js App Router, NestJS, Prisma, pnpm, tsx tests, existing DraftOrbit V3 UI components and tokens.

---

## Scope rewrite

**Goal**
- Add repo-level article source-of-truth docs plus committed visual evidence.
- Introduce a provider seam so article publish can evolve from `manual_x_web` to `native_x_api` without reworking `/app`.
- Normalize API and web contracts so article publish state is explicit (`publishKind`, `publishMode`, `externalUrl`, `nextAction`) instead of piggybacking on tweet terminology.

**Constraints**
- Current truthful behavior stays intact: copy article → open X web → paste article URL back.
- No fake native publisher.
- UI must stay inside `/app`; no new top-level dashboard pages.
- Reuse existing buttons, cards, task panels, spacing, and focus states from the current design system.
- All UI work must cover loading, empty, error, hover, focus-visible, and disabled states.
- Browser verification must include 375 / 768 / 1024 / 1440 and console-error checks.

**Non-goals**
- No automated browser posting.
- No change to tweet/thread publish behavior beyond shared contract cleanup.
- No billing or auth redesign.
- No claim that X public API article publish already exists.

**Done criteria**
- Repo contains article phase docs and committed screenshot evidence.
- Shared capability contract supports both `manual_x_web` and `native_x_api` shapes.
- API responses expose article publish state without tweet-specific naming.
- Web result area and task panel can render both manual and future native actions from one capability contract.
- Narrow tests, typecheck, build, and one real browser verification pass succeed.

**Verification commands**
```bash
npx pnpm@10.23.0 --filter @draftorbit/shared build
npx pnpm@10.23.0 --filter @draftorbit/db prisma:generate
npx pnpm@10.23.0 --filter @draftorbit/api test
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npx pnpm@10.23.0 --filter @draftorbit/api build
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/node_modules/.bin/tsx --test /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-result-copy.test.ts
```

## File structure map

- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md` — current truthful capability + evidence entry.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase2-native-seam.md` — future native capability seam and migration notes.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/project-entry.md` — link article docs from the project entry doc.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/packages/shared/src/x-article.ts` — richer shared capability contract + URL helpers.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/x-article-publisher.ts` — article publisher interface + result types.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/manual-x-web-article.publisher.ts` — current provider implementation.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.module.ts` — register provider.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.service.ts` — delegate article completion/prepare logic to the provider seam.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/v3/v3.service.ts` — normalize response shape and nextAction handling.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/article-publish-ui.ts` — pure UI mapping helpers for article capability.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-card.tsx` — result-area article action block.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-task.tsx` — task-panel article block.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-app.tsx` — consume the new article card.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-task-panel.tsx` — consume the new article task block.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/queries.ts` — normalized article publish fields.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/v3-ui.ts` — add `publish_article` task metadata.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/article-publisher-provider.test.ts` — provider seam tests.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/x-article-capability.test.ts` — richer capability expectations.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/v3-service-helpers.test.ts` — V3 article nextAction / contract assertions.
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts` — pure UI mapping tests.
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts` — new `publish_article` task metadata assertions.

### Task 1: Publish the article source-of-truth docs and commit the visual evidence entry

**Files:**
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase2-native-seam.md`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/project-entry.md`
- Verify assets: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png`, `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png`, `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png`

- [ ] **Step 1: Draft the phase1 capability doc**

```md
# V3 Article Publish Phase 1

## 当前真实路径
1. 在 `/app` 生成 article
2. 点击“复制并去 X 发布”
3. 在 X 网页端完成发布
4. 把最终文章链接贴回 DraftOrbit
5. 系统记录为已发布

## 已验证证据
- `output/reports/uat-full/UAT-ARTICLE-REPORT-uat-article-2026-04-08_23-38-21-483.md`
- `output/playwright/article-export-2026-04-08/article-result-flow.png`
```

- [ ] **Step 2: Draft the phase2 seam doc**

```md
# V3 Article Publish Phase 2 Native Seam

## Capability contract
- `manual_x_web`
- `native_x_api`

## Upgrade rule
- 仅当公开 API、scope、feature flag 同时满足时切到 `native_x_api`
- 否则回退到 `manual_x_web`
```

- [ ] **Step 3: Link both docs from the project entry doc**

```md
## Article publish
- `docs/v3-article-publish-phase1.md` — 当前 article 真实能力与证据入口
- `docs/v3-article-publish-phase2-native-seam.md` — 原生发布能力 seam 与迁移设计
```

- [ ] **Step 4: Verify that the docs and screenshots all exist**

Run:
```bash
test -f /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md
test -f /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase2-native-seam.md
test -f /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png
test -f /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png
test -f /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png
```
Expected: exit code `0` for every file check.

- [ ] **Step 5: Commit the docs slice**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase1.md \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/v3-article-publish-phase2-native-seam.md \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/docs/project-entry.md \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png
git commit -m "docs(article): add publish source-of-truth docs"
```

### Task 2: Enrich the shared article capability contract first

**Files:**
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/packages/shared/src/x-article.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/packages/shared/src/index.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/x-article-capability.test.ts`

- [ ] **Step 1: Write the failing shared capability test**

```ts
test('resolveXArticlePublishCapability returns a future-proof manual capability contract', () => {
  assert.deepEqual(resolveXArticlePublishCapability(), {
    mode: 'manual_x_web',
    availability: 'available',
    nextAction: 'export_article',
    openUrl: 'https://x.com',
    nativeApiAvailable: false,
    reasonCode: 'NO_PUBLIC_API',
    description: '当前公开的 X Developer API 没有提供 Articles 发布端点，长文需要先在 X 网页端完成发布。'
  });
});
```

- [ ] **Step 2: Run the narrow test to prove it fails**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api
./node_modules/.bin/tsx --test test/x-article-capability.test.ts
```
Expected: FAIL because the current shared object lacks `availability` and `reasonCode`.

- [ ] **Step 3: Update the shared contract with explicit capability fields**

```ts
export type XArticlePublishMode = 'manual_x_web' | 'native_x_api';
export type XArticlePublishAvailability = 'available' | 'blocked' | 'degraded';

export type XArticlePublishCapability = {
  mode: XArticlePublishMode;
  availability: XArticlePublishAvailability;
  nativeApiAvailable: boolean;
  nextAction: 'export_article' | 'publish_article';
  openUrl?: string;
  reasonCode?: 'NO_PUBLIC_API' | 'MISSING_X_ACCOUNT' | 'MISSING_SCOPE' | 'FEATURE_FLAG_OFF' | 'PROVIDER_UNAVAILABLE';
  description: string;
};
```

- [ ] **Step 4: Re-run the narrow capability test**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api
./node_modules/.bin/tsx --test test/x-article-capability.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit the shared contract slice**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/packages/shared/src/x-article.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/packages/shared/src/index.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/x-article-capability.test.ts
git commit -m "refactor(article): enrich shared publish capability contract"
```

### Task 3: Introduce the API article publisher seam with a manual provider

**Files:**
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/x-article-publisher.ts`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/manual-x-web-article.publisher.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.module.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.service.ts`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/article-publisher-provider.test.ts`

- [ ] **Step 1: Write the failing provider seam test**

```ts
test('manual provider exposes export flow and records article completion', async () => {
  const provider = new ManualXWebArticlePublisher(prismaMock as never);
  const capability = await provider.getCapability('user_123');

  assert.equal(capability.mode, 'manual_x_web');
  assert.equal(capability.nextAction, 'export_article');
  assert.equal(capability.reasonCode, 'NO_PUBLIC_API');
});
```

- [ ] **Step 2: Run the new provider seam test and verify failure**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api
./node_modules/.bin/tsx --test test/article-publisher-provider.test.ts
```
Expected: FAIL because the provider file/class does not exist yet.

- [ ] **Step 3: Add the seam interface and the manual provider implementation**

```ts
export interface XArticlePublisherProvider {
  getCapability(userId: string): Promise<XArticlePublishCapability>;
  prepare(runId: string, userId: string): Promise<{ capability: XArticlePublishCapability }>;
  recordManualCompletion(runId: string, userId: string, url: string, xAccountId?: string): Promise<{
    status: 'MANUAL_RECORDED';
    externalUrl: string;
    publishMode: 'manual_x_web';
  }>;
}
```

```ts
@Injectable()
export class ManualXWebArticlePublisher implements XArticlePublisherProvider {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCapability() {
    return resolveXArticlePublishCapability();
  }

  async prepare() {
    return { capability: resolveXArticlePublishCapability() };
  }

  private async saveManualRecord(input: { runId: string; userId: string; normalizedUrl: string; xAccountId?: string }) {
    return this.prisma.db.publishRecord.upsert({
      where: { generationId: input.runId },
      update: { externalTweetId: input.normalizedUrl, publishedAt: new Date() },
      create: { generationId: input.runId, externalTweetId: input.normalizedUrl, publishedAt: new Date() }
    });
  }

  async recordManualCompletion(runId: string, userId: string, url: string, xAccountId?: string) {
    const normalizedUrl = normalizeXArticleUrl(url);
    if (!normalizedUrl) throw new BadRequestException('请输入有效的 X 文章链接（https://x.com/...）');
    return this.saveManualRecord({ runId, userId, normalizedUrl, xAccountId });
  }
}
```

- [ ] **Step 4: Wire the provider into the module and rerun narrow API tests**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api
./node_modules/.bin/tsx --test test/article-publisher-provider.test.ts test/x-article-capability.test.ts test/v3-service-helpers.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit the API seam slice**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/x-article-publisher.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/manual-x-web-article.publisher.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.module.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/publish/publish.service.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/article-publisher-provider.test.ts
git commit -m "refactor(article): introduce manual publish provider seam"
```

### Task 4: Normalize the V3 API and web contract around article publish state

**Files:**
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/v3/v3.service.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/v3-service-helpers.test.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/queries.ts`

- [ ] **Step 1: Write the failing V3 contract assertions**

```ts
test('resolveV3PublishGuard uses shared article capability metadata', () => {
  assert.deepEqual(resolveV3PublishGuard('article'), {
    blockingReason: 'ARTICLE_PUBLISH_NOT_SUPPORTED',
    nextAction: 'export_article',
    message: '当前长文暂不支持直接发布，请先复制到 X 网页端完成发布。'
  });
});
```

```ts
export type V3PublishedItem = {
  id: string;
  runId: string;
  status: string;
  publishKind: 'x_post' | 'x_article';
  publishMode: 'manual_x_web' | 'native_x_api';
  externalUrl: string | null;
  updatedAt: string;
};
```

- [ ] **Step 2: Run the current helper tests and confirm they fail on the new fields**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api
./node_modules/.bin/tsx --test test/v3-service-helpers.test.ts
```
Expected: FAIL because `resolveV3PublishGuard` and the response shape still use the older contract.

- [ ] **Step 3: Update V3 service serialization to expose normalized article publish fields**

```ts
return {
  id: publish.id,
  runId: generation.id,
  status: publish.status,
  publishKind: generation.type === GenerationType.LONG ? 'x_article' : 'x_post',
  publishMode: publish.status === 'MANUAL_RECORDED' ? 'manual_x_web' : 'native_x_api',
  externalUrl: publish.externalTweetId ?? null,
  externalPostId: publish.externalTweetId ?? null, // temporary fallback until web fully migrates
  updatedAt: publish.updatedAt.toISOString()
};
```

- [ ] **Step 4: Update web query types to consume the normalized fields first**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npx pnpm@10.23.0 --filter @draftorbit/api build
```
Expected: PASS.

- [ ] **Step 5: Commit the normalized contract slice**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/src/modules/v3/v3.service.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/api/test/v3-service-helpers.test.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/queries.ts
git commit -m "refactor(article): normalize v3 publish state contract"
```

### Task 5: Split article UI into focused components and support both manual/native states

**Files:**
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/article-publish-ui.ts`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-card.tsx`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-task.tsx`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-app.tsx`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-task-panel.tsx`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/v3-ui.ts`
- Create: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts`
- Modify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts`

- [ ] **Step 1: Write pure UI tests before touching TSX**

```ts
test('manual_x_web maps to export CTA copy', () => {
  assert.deepEqual(getArticlePrimaryAction({
    mode: 'manual_x_web',
    availability: 'available',
    nextAction: 'export_article'
  }), {
    label: '复制并去 X 发布',
    secondaryLabel: '只复制长文'
  });
});

test('native_x_api maps to direct publish CTA copy', () => {
  assert.deepEqual(getArticlePrimaryAction({
    mode: 'native_x_api',
    availability: 'available',
    nextAction: 'publish_article'
  }).label, '直接发布到 X');
});
```

- [ ] **Step 2: Run the web tests to prove the mapping helper does not exist yet**

Run:
```bash
/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/node_modules/.bin/tsx --test /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts
```
Expected: FAIL because `article-publish-ui.ts` and the new task metadata do not exist.

- [ ] **Step 3: Add the pure UI helper and focused article components**

```ts
export function getArticlePrimaryAction(capability: XArticlePublishCapability) {
  if (capability.mode === 'native_x_api' && capability.availability === 'available') {
    return { label: '直接发布到 X', secondaryLabel: '复制长文备用' };
  }
  return { label: '复制并去 X 发布', secondaryLabel: '只复制长文' };
}
```

```tsx
type ArticlePublishCardProps = {
  capability: XArticlePublishCapability;
  draftText: string;
  articleUrl: string;
  saving: boolean;
  onCopy: () => Promise<void>;
  onOpenX: () => void;
  onSaveUrl: (url: string) => Promise<void>;
};

export function ArticlePublishCard(props: ArticlePublishCardProps) {
  return props.capability.mode === 'manual_x_web'
    ? <ManualExportCard {...props} />
    : <NativePublishCard {...props} />;
}
```

- [ ] **Step 4: Rewire `operator-app` and `operator-task-panel` to the new components and rerun web checks**

Run:
```bash
/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/node_modules/.bin/tsx --test /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-result-copy.test.ts
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
```
Expected: PASS.

- [ ] **Step 5: Commit the UI slice**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/article-publish-ui.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-card.tsx \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/article-publish-task.tsx \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-app.tsx \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/components/v3/operator-task-panel.tsx \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/lib/v3-ui.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts
git commit -m "refactor(article): split publish ui by capability mode"
```

### Task 6: Run the full verification pass, capture browser evidence, and refresh the PR summary

**Files / outputs:**
- Verify: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/`
- Optional report refresh: `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/`
- PR: `https://github.com/yangshu2087/draftorbit/pull/1`

- [ ] **Step 1: Start local dev servers with the web/API origin pairing used in prior successful browser verification**

Run:
```bash
cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher
APP_URL=http://127.0.0.1:3100 PORT=4100 npx pnpm@10.23.0 --filter @draftorbit/api dev

cd /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web
PORT=3100 NEXT_PUBLIC_API_URL=http://127.0.0.1:4100 ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3100
```
Expected: both servers start cleanly; `/app` loads without CORS failure.

- [ ] **Step 2: Perform one browser verification pass across required states**

Checklist:
- 375 / 768 / 1024 / 1440
- article generation works
- manual export block renders
- saved-link state renders
- native capability mock path renders if feature-flagged in helper/test mode
- console errors = 0

- [ ] **Step 3: Save screenshots and confirm they exist**

Run:
```bash
test -d /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08
ls -1 /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08
```
Expected: screenshot filenames are listed.

- [ ] **Step 4: Re-run final narrow verification suite**

Run:
```bash
npx pnpm@10.23.0 --filter @draftorbit/shared build
npx pnpm@10.23.0 --filter @draftorbit/db prisma:generate
npx pnpm@10.23.0 --filter @draftorbit/api test
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npx pnpm@10.23.0 --filter @draftorbit/api build
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
```
Expected: all commands succeed.

- [ ] **Step 5: Update the PR summary to mention the article docs and capability seam**

```bash
gh pr view 1 --json body --jq .body > /tmp/draftorbit-pr-body-current.md
cp /tmp/draftorbit-pr-body-current.md /tmp/draftorbit-pr-body-next.md
cat >> /tmp/draftorbit-pr-body-next.md <<'EOF2'

## Article follow-up
- added repo-level article source-of-truth docs
- normalized shared/API/article publish capability contract
- split article UI into manual-web vs native-capability-ready surfaces
EOF2

gh pr edit 1 --body-file /tmp/draftorbit-pr-body-next.md
```
Expected: `gh` prints the PR URL.

- [ ] **Step 6: Commit the verification/evidence refresh**

```bash
git add /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08 \
        /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full
git commit -m "docs(article): refresh verification evidence"
```

## Self-review checklist

- [ ] The plan covers both A (docs/evidence) and B (native capability seam).
- [ ] Every created/modified file uses an absolute path.
- [ ] No task depends on an unnamed helper or undefined type.
- [ ] The UI task explicitly covers loading / empty / error / hover / focus-visible / disabled states.
- [ ] The verification task includes a real browser pass.
- [ ] The migration path keeps the current truthful user flow intact.
