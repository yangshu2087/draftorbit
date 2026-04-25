# V4 GPT Quality + Simplified Generator UAT — 2026-04-25

## Scope

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Branch: `codex/draftorbit-v4-creator-studio`
- Goal: preserve the current homepage style while simplifying ordinary-user creation UX and moving routing / quality / visual planning details behind the API pipeline.
- Model policy check: official OpenAI sources were reviewed before updating defaults:
  - `https://developers.openai.com/api/docs/models` shows the current API model catalog and specialized image models including GPT Image 2.
  - `https://academy.openai.com/public/resources/latest-model` documents API model IDs for GPT-5.4 (`gpt-5.4`, `gpt-5.4-pro`) and GPT-5.3 (`gpt-5.3-chat-latest`).

## Product contract validated

普通用户路径现在只暴露：

1. `/` 可信首页入口。
2. `/app` 主创作入口：一句话输入、短推/串推/长文选择、后台生成阶段、结果、导出、手动确认。
3. `/v4` 内部/新版工作台：图文包、diagram、source-required fail-closed、导出包。
4. 后台保留 provider / routing / quality / signed asset 细节；默认不作为普通用户卖点展示。

## Browser-use evidence

| Step | Result | Evidence |
| --- | --- | --- |
| `/` homepage | PASS — current visual direction preserved; `本机快速体验` and `用 X 登录开始` visible; no `Codex OAuth` copy. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-home-2026-04-25.png` |
| `/` → `/app` | PASS — clicked `本机快速体验`; navigated to `/app`. | browser-use URL check: `http://127.0.0.1:3400/app` |
| `/app` simplified empty state | PASS — shows `写一句话，后台完成策略、正文和图文资产`; short/thread/article chips visible; routing/provider panels hidden. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-app-empty-2026-04-25.png` |
| `/app` tweet generation | PASS — generated result completed with visual assets and export actions; no prompt wrapper or raw provider error leaked. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-app-result-visible-2026-04-25.png` |
| `/app` export actions | PASS — `下载 SVG`, `下载全部图文资产`, `下载导出包`, `复制 Markdown`, `下载 Markdown`, `导出 HTML` visible after signed run. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-app-export-visible-2026-04-25.png` |
| `/app` publish safety | PASS — publish action remains manual / connection-gated; no automatic X post. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-app-publish-visible-2026-04-25.png` |
| quality numbers hidden | PASS — after direct fix, ordinary UI no longer shows raw `质量 76.57`, `hook 84`, etc.; qualitative badges remain. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-no-quality-score-2026-04-25.png` |
| `/v4` simplified copy | PASS — headline is user-centric; no `Codex OAuth`, provider, or model routing panel. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-v4-page-2026-04-25.png` |
| `/v4` diagram | PASS — diagram preview and export actions available; no prompt/provider leak. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-v4-diagram-result-2026-04-25.png` |
| latest no-source | PASS — fail-closed with recoverable source guidance; no raw provider error. | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-gpt-simplification-latest-fail-closed-2026-04-25.png` |
| console errors | PASS — browser-use `tab.dev.logs({ levels: ['error'] })` returned `0` errors for the checked tab. | browser-use log check |

## Backend/API evidence

- `/health` returned `200` with `ready=true`, `db=true`, `redis=true`.
- Signed bundle link emitted by the real `/app` run was tokenized and downloadable:
  - `curl` status: `200 application/zip`
  - downloaded size: `7594` bytes
  - token value intentionally not stored in this report.
- API contract remains unchanged for ordinary clients:
  - existing `/v3/chat/run`, `/v3/chat/runs/:id/stream`, `/v3/chat/runs/:id/assets/*`, and `/v4/studio/*` are reused.
  - signed asset / bundle access stays scoped by run + asset token or existing workspace ownership.
- Error semantics validated:
  - latest/no-source returns user-facing source-required recovery instead of fabricated content.
  - provider/raw stderr is not surfaced in ordinary UI.

## Direct fixes from UAT

1. Removed raw numeric quality details from ordinary user UI:
   - `质量 76.57` is normalized out of stage summaries.
   - raw signal badges like `hook 84` are replaced by qualitative chips (`开头有抓手`, `表达更自然`, etc.).
2. Kept model routing / provider / fallback observability behind `NEXT_PUBLIC_SHOW_MODEL_ROUTING_PANEL=1`.
3. Reworded V4 and asset labels away from `Codex OAuth` / provider-first language into user-facing delivery language.

## Automated verification run in this slice

```bash
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx --test test/model-gateway.test.ts test/visual-planning.test.ts test/v4-studio-contract.test.ts
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web exec tsx --test test/v4-studio.test.ts
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck
NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build
```

Observed before the final quality-number fix:

- targeted API tests: `22/22` passed.
- targeted V4 web unit tests: `9/9` passed.
- web test: node tests `32/32` passed; Playwright `5/5` passed; harness `7.70s`.
- full API tests: `253/253` passed.
- API/web typecheck passed.
- web build passed.

Final re-run after the quality-number fix:

- API tests: `253/253` passed.
- API typecheck: passed.
- Web typecheck: passed.
- Web test: node tests `32/32` passed; Playwright `5/5` passed; harness `13.92s`.
- Web build: passed (`14/14` static pages).

## Remaining risks / notes

- Live OpenAI key evidence is not required for this default pass; routing is configured GPT-first when `OPENAI_API_KEY` exists and Codex local remains the no-key fallback.
- V4 browser-use checked diagram and latest fail-closed directly; thread/article coverage remains enforced by the existing Playwright CI suite and API/web contract tests.
- Real X posting, real checkout, and OAuth final grant were not executed.
