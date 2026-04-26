# Source URL Quality Chain UAT — 2026-04-26

## Scope

This pass fixes the full `/app` URL-source quality chain. The root issue was not only source capture: a pasted source URL could be detected by the UI, but the V3 prompt envelope stripped multiline `来源 URL：...` before backend source capture. When capture did succeed, source-ready drafts could still be quality-blocked with generic copy, leaving users with `来源已采用` but no clear deliverable or recovery path.

## Product contract

A fresh/latest request with a user-provided URL must resolve to one of two ordinary-user states:

1. **Deliverable**: show `来源已采用`, publishable text, ready visual/export assets, copy/download/manual-publish actions.
2. **Recoverable**: keep the source evidence card, hide bad text/assets, and show the source-specific CTA `基于该来源重写一版`.

It must not end in a split state where `来源已采用` is visible while the primary result says only `需要处理后再交付` or suggests unrelated `缩小主题` actions.

## Root cause and fix

- Backend envelope parsing previously extracted only the same line after `用户意图：`; multiline source lines such as `来源 URL：https://example.com/` were lost before `SourceCaptureService`.
- `extractIntentFromPrompt` now preserves multiline intent until the next V3 envelope section, so URL capture receives the URL.
- Project context filtering was tightened in `extractIntentFocus` so SkillTrust/project metadata is excluded from topic focus without dropping user source URLs.
- Source-ready quality failures now attempt a `source-grounded final fallback` for tweet/thread/article, rebuilding text and visual assets from captured source title/body facts.
- If the fallback still fails, `qualityGate.hardFails` carries internal flags `source_ready_repair_attempted` and `source_ready_repair_failed`; the UI maps these to the source-specific rewrite path instead of generic blocked-result copy.
- Content quality gate now rejects `URL:`, `Captured`, `markdownPath`, and similar source metadata leakage for all formats, not only articles.

## Browser verification

- Environment: local API `http://127.0.0.1:4311`, local Web `http://127.0.0.1:3400/app`.
- Browser surface: Codex in-app Browser Use (`iab`) plus Playwright CI browser pass.
- Scenario A: typed a fresh/latest prompt without URL.
  - Result: amber warning with `data-tone="warning"` and copy `这类主题建议先补来源`.
  - Screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/source-url-line-highlight-2026-04-26.png`.
- Scenario B: clicked `粘贴来源 URL`.
  - Result: prompt textarea scrolled/focused and the dedicated `来源 URL：` line was selected for paste guidance.
- Scenario C: filled `来源 URL：https://example.com/`.
  - Result: hint changed to green ready with `data-tone="ready"` and copy `已检测到来源 URL，可以生成`.
  - Screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/source-url-ready-hint-2026-04-26.png`.
- Scenario D: generated from `https://example.com/`.
  - Result: source captured and adopted; result area showed `来源已采用`, deliverable text, visible visual/export asset actions, and safe manual publish gate.
  - Outcome JSON observed in Browser Use: `sourceFixOutcome=deliverable`, `hasSourceAdopted=true`, `hasDeliverable=true`, `hasRewriteRecovery=false`, `hasSourceFailed=false`, `hasGenericNoPath=false`.
  - Screenshots:
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/source-url-deliverable-after-fix-2026-04-26.png`
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/source-url-result-visible-after-fix-2026-04-26.png`
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/source-url-assets-visible-after-fix-2026-04-26.png`
- Browser console errors during this UAT: `0`.

## Backend/API evidence

- Public contract unchanged: this pass reuses `POST /v3/chat/run`, `GET /v3/chat/runs/:id/stream`, and `GET /v3/chat/runs/:id`; no new public route was added.
- Error semantics preserved:
  - no source for latest/fresh prompts still fail-closes;
  - unsupported content type or bad HTTP status still fail-closes;
  - source-ready drafts that cannot pass quality get recoverable source-specific copy;
  - prompt/provider/debug/source metadata leakage remains a hard block.
- Permissions/data consistency:
  - `SourceArtifact` keeps the existing `status/evidenceUrl/markdownPath/title/url` shape;
  - large markdown/SVG/bundle artifacts remain under ignored local artifact roots;
  - run/asset download permissions continue to rely on existing workspace ownership or signed asset URLs;
  - no secrets, raw OAuth tokens, raw provider stderr, or prompt wrappers are exposed to ordinary users.
- Durable prevention added through regression tests:
  - source URL fallback capture for direct fetch;
  - multiline V3 prompt-envelope source URL preservation;
  - source-grounded tweet/thread fallback passing the quality gate;
  - all-format source metadata leakage rejection;
  - UI source-specific recovery copy when repair still fails.

## Verification commands

- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — PASS, `273/273`.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` — PASS.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — PASS.
- `WEB_PLAYWRIGHT_SKIP_WEBSERVER=1 WEB_PLAYWRIGHT_BASE_URL=http://127.0.0.1:3400 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — PASS, Node `43/43`, Playwright `6/6`, harness `4.29s`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — PASS, `15/15` pages.

## Done criteria

- URL-source success no longer leaves users at `来源已采用` with no path forward.
- `https://example.com/` now reaches a deliverable sourced result in local UAT; if future repair fails, the UI shows `基于该来源重写一版` and hides bad draft/assets.
- Bad drafts, prompt leaks, provider stderr, source metadata leakage, and placeholder/mock assets remain blocked.
- Visual/export assets are shown only when ready; otherwise the source-specific retry/rewrite path is shown.
- API/Web regression suites and browser UAT passed.

## Remaining risk

- None for the URL-source split-state regression. Source-ready deliverable results now suppress the generic low-score warning; only concrete remaining risks such as manual publish confirmation stay visible.
