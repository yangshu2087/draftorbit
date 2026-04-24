# Agent Handoff


## Current V4 Creator Studio TDD slice (2026-04-23)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Branch: `codex/draftorbit-v4-creator-studio`
- Base: `origin/codex/web-ci-panel-observability-8s` at `02693e8`.
- Goal in this pass: continue V4 rebuild with TDD by adding failing V4 route/API/preview tests first, then implementing `/v4` Creator Studio.
- Architecture choice:
  - Chosen: V4 is an additive wrapper and UI route (`/v4`) over the existing V3 generation/run asset pipeline.
  - Tradeoff: lower migration risk and immediate rollback to `/app`/`/v3`; deeper V4-native orchestration can land later.
  - Rollback: remove `/v4` route and `V4Module` import; V3 remains untouched.
- Backend/API lane:
  - New `GET /v4/studio/capabilities` public capability contract.
  - New protected `POST /v4/studio/run` with `AuthGuard` + subscription check; normalizes V4 formats into safe V3 generation requests.
  - New protected `GET /v4/studio/runs/:id` preview mapper; reuses workspace-scoped V3 run retrieval and signed asset semantics.
  - Error semantics: latest/freshness prompts without URL fail closed with `424 SOURCE_REQUIRED` and `recoveryAction=add_source`.
  - Data consistency: large artifacts stay under ignored artifact roots; V4 preview exposes metadata/provenance/checksum paths only.
- Front-end/UX lane:
  - New `/v4` Creator Studio with left input/source pane, center format/control/result preview, right provenance/parity pane.
  - States covered: empty, loading, source-required warning/error, preview ready, export controls, disabled unsafe publish.
  - Visual thesis: light-first creator workstation with calm SaaS hierarchy, border-first cards, one primary dark CTA, and explicit provenance.
- baoyu/runtime:
  - Runtime pin updated to GitHub main `8c17d77209b030a97d1746928ae348c99fefa775` (`chore: release v1.111.1`).
  - `baoyu-image-gen` remains documented as deprecated alias in favor of `baoyu-imagine`.
- Verification in this pass:
  - `git ls-remote https://github.com/JimLiu/baoyu-skills.git refs/heads/main` => `8c17d77209b030a97d1746928ae348c99fefa775`.
  - `node scripts/ensure-baoyu-skills-runtime.mjs` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` ✅ (`250/250`)
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅ (`28` node tests + `5` Playwright tests)
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅
  - browser-use in-app browser pass on `http://127.0.0.1:3400/v4` ✅
    - screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-browser-use-creator-studio-2026-04-23.png`
- Report:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/reports/uat-full/V4-BROWSER-USE-UAT-2026-04-23.md`
- Follow-up browser-use iteration (2026-04-24):
  - Finding: local no-token V4 preview enabled `下载 bundle` even though no signed asset URL existed yet.
  - Fix: `buildV4StudioPreview()` now exposes `hasDownloadableAssets` + `bundleActionCopy`; local preview shows disabled `登录后生成下载链接`, authenticated/signed run keeps `下载 bundle`.
  - Regression: `apps/web/test/v4-studio.test.ts` includes signed-URL-gated bundle action coverage.
  - Browser-use recheck: `/v4` thread preview shows `Codex 本机 SVG`, `准备发布 / 手动确认`, and disabled `登录后生成下载链接`.

Use this file to transfer execution state between Codex, Cursor, and other agents.
Update it before pausing work, switching tools, or asking another agent to continue.

## Current CI reporter-time <10 stabilization + trend summary pass (2026-04-18)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-panel-observability-8s`
- Goal in this pass:
  - move required web Playwright lane from the current `~10.2s` watch edge to a safer `<10s` zone by reducing worker tail.
  - persist and surface **trend comparison** directly in Actions summary (not just one-run snapshots).
- Changes in this pass:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/e2e/ordinary-user-ci.spec.ts`
    - `openApp()` now supports `includeRoutingPanel` option.
    - only one generation lane blocks on routing panel readiness; other lanes measure core shell bootstrap to reduce duplicated panel wait cost and tail latency.
    - route-entry test still asserts “模型路由观测” visibility to preserve UX/state coverage.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/.github/workflows/ci.yml`
    - bumped `WEB_PLAYWRIGHT_WORKERS` from `3` to `4` in required `Web test (required)`.
    - added lightweight trend-cache lifecycle:
      - restore `web-playwright-trend-*` cache before web test,
      - pass `WEB_PLAYWRIGHT_TREND_FILE=/tmp/web-ci-trend/playwright-trend.json`,
      - save trend cache after run.
    - trend cache scope uses `${{ github.head_ref || github.ref_name }}` so pull_request merge refs reuse branch trend history.
    - adds timing row for trend-cache restore into the existing CI step duration table.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/scripts/run-playwright-ci.mjs`
    - added trend-state read/write (JSON) support for reporter/app-bootstrap metrics.
    - computes and publishes trend rows in `$GITHUB_STEP_SUMMARY`:
      - reporter vs previous run delta,
      - reporter rolling average,
      - reporter trend status (under target or watch),
      - app-bootstrap max vs previous run delta,
      - app-bootstrap rolling average,
      - tracked run count.
- Verification in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` with CI env + `WEB_PLAYWRIGHT_WORKERS=4` ✅
    - real Playwright browser run: `4 passed (2.8s)` then repeat `4 passed (3.0s)`.
    - harness wall time: `5.30s` / `5.99s`.
    - trend file verified:
      - `/tmp/web-ci-trend/playwright-trend.json` with `totalRuns: 2`, `recentReporterSeconds: [2.8, 3]`.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅

## Current high-yield minimal upgrade package (2026-04-18)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-perf-8s-stability`
- Scope completed in this pass:
  1. Routing strategy layering by `taskType + contentFormat`.
  2. Health-probe-driven provider fallback (cooldown skip).
  3. Observability instrumentation + dashboard/report template.
- API routing changes:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/common/openrouter.service.ts`
    - `RoutedChatOptions` now supports `contentFormat: tweet|thread|article|diagram|generic`.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/common/model-gateway.service.ts`
    - candidate pool now factors both `taskType` and `contentFormat`.
    - low-latency tweet lanes prefer floor models earlier; depth-critical lanes (article/diagram/package) keep high-tier priority.
    - provider health state tracks recent success/failure samples and cooldown windows.
    - cooldown providers are skipped when alternatives exist; if all candidates are cooling down, original pool is retained to avoid deadlock.
    - request-level observability events are appended as NDJSON when `MODEL_GATEWAY_OBSERVABILITY_ENABLED=1`.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/common/codex-local.service.ts`
    - local Codex prompt now carries `contentFormat` hint.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/modules/generate/generate.service.ts`
    - all major `chatWithRouting` callsites now pass `contentFormat` (and `diagram` hint when visual mode is diagram).
- Regression coverage:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/test/model-gateway.test.ts`
    - added tests for format-aware layering and health fallback behavior.
- Observability/reporting deliverables:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/scripts/model-routing-dashboard-report.ts`
    - reads NDJSON routing events and outputs markdown dashboard.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/docs/observability/MODEL-ROUTING-DASHBOARD-TEMPLATE.md`
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/reports/observability/MODEL-ROUTING-DASHBOARD-2026-04-18_14-48-28.md` (sample generated report)
  - root `package.json`: new command `pnpm report:model-routing`.
- Verification in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test -- model-gateway.test.ts` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` ✅
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅ (Playwright reporter ~8.15s)
  - `MODEL_GATEWAY_OBSERVABILITY_ENABLED=1 ... npx pnpm@10.23.0 report:model-routing` ✅

## Current phase-2 integration (usage/ops observability surfaced in /app) (2026-04-18)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-perf-8s-stability`
- Goal in this pass: continue “第2阶段” by exposing model-routing health and fallback hotspots in the ordinary-user `/app` flow without breaking local-default pass criteria.
- Architecture choice in this pass:
  - Chosen: **reuse existing `/usage/summary` contract** and enrich it with routing-health metadata from `ModelGatewayService`; then render in `/app`.
  - Not chosen: add a new `/v3/ops` endpoint. Reason: higher contract/migration cost for little user value; `/usage/summary` already powers ops/usage lane and is guarded by auth/workspace context.
  - Rollback path: remove `/app` usage-summary fetch + panel; existing generation flow remains unchanged.
- Backend/API lane changes:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/common/model-gateway.service.ts`
    - added `getRoutingHealthSnapshot()` public accessor.
    - returns profile + health-probe config + per-provider health summary for ops/usage consumption.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/modules/usage/usage.service.ts`
    - injects `ModelGatewayService`.
    - exports `buildRoutingFallbackHotspots(...)`.
    - `summary()` now enriches `modelRouting` with:
      - `profile`
      - `healthProbe`
      - `providerHealth`
      - `fallbackHotspots`
    - keeps existing `fallbackRate/avgQualityScore` fields for guidance compatibility.
  - API semantics unchanged:
    - route still `GET /usage/summary` under AuthGuard.
    - permissions and workspace scoping unchanged (`WorkspaceContextService` default workspace resolution).
    - error envelope remains existing app-level behavior.
- Regression coverage added/updated:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/test/usage-routing-observability.test.ts`
    - validates fallback-hotspot sorting/limit behavior.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/test/model-gateway.test.ts`
    - validates health snapshot shape for ops/usage panels.
- Front-end/UX lane changes:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/lib/queries.ts`
    - adds `fetchUsageSummary()` and typed `UsageSummaryResponse`.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/components/v3/operator-app.tsx`
    - `/app` now loads usage summary as a non-blocking dependency.
    - adds “模型路由观测” panel:
      - counters (`totalCalls`, `fallbackRate`, `avgQualityScore`)
      - provider health probe cards (healthy/cooling-down state)
      - fallback hotspot list (lane + rate + hit count)
    - if usage data fails, panel degrades gracefully and does not block generation.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/e2e/ordinary-user-ci.spec.ts`
    - CI mock now serves `/usage/summary`.
    - adds regression assertion that `/app` renders “模型路由观测”.
- Verification run in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test -- test/model-gateway.test.ts test/usage-routing-observability.test.ts` ✅ (`244/244`)
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅
    - real Playwright pass: `4 passed (6.9s)`, harness `7.33s`.
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅

## Current CI performance branch for routing-panel timing observability (2026-04-18)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-panel-observability-8s`
- Base commit: `4ab70d0` (`feat: surface routing health and fallback hotspots in app`)
- Goal in this pass:
  - keep `pnpm --filter @draftorbit/web test` in the required lane stable.
  - add explicit CI timing visibility for the new `/app` routing-observability panel request path (`/usage/summary`) without changing product behavior.
- Changes in this pass:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/e2e/ordinary-user-ci.spec.ts`
    - `openApp()` now emits:
      - `[ci-perf] app bootstrap (includes /usage/summary panel) completed in <Xs>`
    - this captures user-visible `/app` bootstrap timing including the new panel readiness.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/web/scripts/run-playwright-ci.mjs`
    - parses app-bootstrap timing markers from Playwright output.
    - parses generation-scenario timings and computes count/avg/slowest.
    - appends these metrics into `$GITHUB_STEP_SUMMARY`:
      - app bootstrap target/avg/max/status
      - generation scenario count/avg/slowest
    - adds `WEB_PLAYWRIGHT_APP_BOOTSTRAP_TARGET_SECONDS` (default `2.5`) as non-blocking watch metric.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/.github/workflows/ci.yml`
    - sets `WEB_PLAYWRIGHT_APP_BOOTSTRAP_TARGET_SECONDS: '2.5'` in the required `Web test (required)` job.
- Performance/verification evidence in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅
    - node tests: `23/23`
    - Playwright: `4 passed (6.0s)` (reporter), harness `6.43s`
    - app bootstrap markers from logs:
      - `0.37s`, `0.29s`, `0.32s` (includes `/usage/summary` panel)
    - generation markers still present for scenario-level hotspot tracking.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅

## Current built-in browser UAT-driven iteration pass (2026-04-18)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-perf-8s-stability`
- Goal in this pass: execute a fresh ordinary-user full-flow acceptance from `/` to `/app` and route gates (`/queue` `/connect` `/pricing`), re-verify X-login entry, and directly fix blockers before local commit (no push).
- Key runtime used:
  - API `http://127.0.0.1:4311` with `X_CALLBACK_URL=http://127.0.0.1:3300/auth/callback`, `AUTH_MODE=self_host_no_login`.
  - Web `http://127.0.0.1:3300` using `next build` + `next start` for stable UAT.
  - `vendor/baoyu-skills` restored/pinned to `9977ff520c49ea0888d8d43d582973c6e8c1d55a` by `node scripts/ensure-baoyu-skills-runtime.mjs`.
- Blocker found and fixed in this pass:
  - Ordinary-user case `diagram-process-prompt` failed closed because tweet quality gate hard-failed `missing_scene` even for explicit diagram-intent prompts.
  - Fix:
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/src/modules/generate/content-quality-gate.ts`
      - add diagram-intent detection from `visualPlan` + text/focus cues.
      - keep tweet scene guard for normal tweet flows, but clear `missing_scene` when diagram intent is explicit.
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/apps/api/test/content-quality-gate.test.ts`
      - add regression test `buildContentQualityGate allows diagram-intent tweet prompts without missing_scene hard fail`.
- Browser/UAT evidence captured:
  - Full ordinary-user sync rerun passed: `7/7` cases.
    - tracked report: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-18_06-48-53.md`
    - artifact root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/ordinary-user-baoyu-sync-2026-04-18_06-48-53/`
  - Real browser route/CTA pass from `/` to `/app` plus queue/connect/pricing gates:
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/local-full-flow-2026-04-18-14-07-46/full-flow-report.json`
  - X login entry verification after callback env wiring:
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/x-login-uat-result-2026-04-18-14-07-09.json`
    - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability/output/playwright/x-login-entry-uat-2026-04-18-14-07-09.png`
    - result: no `Missing required env: X_CALLBACK_URL`; redirect reaches `https://x.com/i/oauth2/authorize...`.
- Verification commands run in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅ (`23` node tests + `4` Playwright tests, reporter `3.0s`)
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` ✅
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` ✅ (`237/237`)
- Safety guard remains unchanged:
  - no real X post execution;
  - no real payment execution;
  - external-key absence continues to fail closed or mark evidence as local-only.


## Current Playwright reporter-time stabilization pass (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/web-ci-perf-8s-stability`
- Branch: `codex/web-ci-perf-8s-stability`
- Base: `origin/main` at `90fb21816e7b3df9ce628fbcea390c699729f88f`.
- Goal: stabilize web Playwright reporter time around the 8s lane with lower run-to-run variance while preserving the required-check contract.
- Scenario optimization:
  - `apps/web/e2e/ordinary-user-ci.spec.ts` now keeps the app open per generation-group test and reuses the same page/session across scenarios instead of reopening `/app` every scenario.
  - Generation scenarios are split into two grouped tests (`tweet/thread` and `article/diagram`) to reduce per-step churn and improve CI worker scheduling.
  - Retry-only visual recovery + latest-source fail-closed assertions now run in one continuous app session test instead of two separate reopen flows.
  - Connect/queue/pricing safe-gate checks are folded into the home→app entry test to remove an extra test lifecycle while keeping route coverage.
  - Mobile CTA test keeps hover/focus/overflow assertions but removes always-on screenshot capture in CI runs to cut avoidable I/O latency.
  - Added per-scenario timing logs (`[ci-perf] generation scenario ...`) for direct hotspot inspection in Actions logs.
- CI observability upgrade:
  - `.github/workflows/ci.yml` now writes a persistent `CI step duration table` into `$GITHUB_STEP_SUMMARY`.
  - Web Playwright workers are tuned to `3` in CI to improve parallel scheduling while staying below the prior contention seen at higher worker counts.
  - The table includes wall time + note for `Restore Playwright Chromium cache`, `Install Playwright Chromium`, `Web test (required)`, `Web build`, and cache save behavior.
  - Added explicit restore/save timing rows (including skipped-on-cache-hit visibility) so long-tail cache behavior is observable across runs.


## Current main CI budget flake recovery (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/fix-main-web-budget-flake`
- Branch: `codex/fix-main-web-budget-flake`
- Base: `origin/main` at `0b238e3e244c29a100b823fcbca955c9a4142571`, the PR #5 merge commit.
- Context: PR #5 passed twice with Playwright reporter times `9.4s` and `9.5s`, but the post-merge `main` run `24559547245` failed because the same browser suite passed at `10.3s` and tripped the exact `10s` hard budget.
- Fix direction: keep `10s` as the reported target, but separate it from the required-check hard budget. CI now records `Reporter target`, `Reporter hard budget`, `Target status`, and `Required-check budget status`.
- Required check policy: test failures still fail immediately; only runner performance jitter between the 10s target and 12s hard budget is reported as `watch` instead of blocking `main`.


## Current Actions Node 24 CI compatibility pass (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/actions-node24-ci-observability`
- Branch: `codex/actions-node24-ci-observability`
- Base: `origin/main` at `ca77f0d07a2af585dda9be1be635c7798ed581f5` after PR #4 was merged.
- Goal: pre-test GitHub JavaScript Actions under Node 24 by setting `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`, while keeping the required `Web required checks` contract unchanged.
- CI workflow updates in this pass:
  - `.github/workflows/ci.yml` now sets workflow-level `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` and upgrades the workflow to current Node 24-native actions: `actions/checkout@v6`, `actions/setup-node@v6`, `actions/cache/*@v5`, `actions/upload-artifact@v7`, and `pnpm/action-setup@v5`.
  - Playwright Chromium cache is split into explicit `actions/cache/restore@v5` and `actions/cache/save@v5` steps, so cache save latency is visible as a named step instead of being hidden in a post-job action.
  - `$GITHUB_STEP_SUMMARY` records the Node 24 opt-in flag, Playwright cache hit status, cache key, existing web test step wall time, Playwright reporter time, and harness wall time.
- Required check contract remains: `Web required checks` still runs `pnpm --filter @draftorbit/web typecheck`, `pnpm --filter @draftorbit/web test`, and `pnpm --filter @draftorbit/web build`.
- GitHub iteration note: forcing the old v4 actions to Node 24 passed but still emitted a deprecation annotation because those actions target Node 20. The pass now upgrades to the current Node 24-native major versions and keeps `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` as an explicit compatibility guard.
- GitHub evidence captured on PR #5 after upgrading actions:
  - PR: `https://github.com/yangshu2087/draftorbit/pull/5`
  - PR run: `https://github.com/yangshu2087/draftorbit/actions/runs/24558696855`, job `71801586206`, `Web required checks` passed in `1m3s`.
  - Node 24 action runtime: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` appeared in action step env logs, and `gh run view 24558696855 --log | grep -q "Node.js 20"` returned absent.
  - Action compatibility: `actions/checkout@v6`, `pnpm/action-setup@v5`, `actions/setup-node@v6`, and `actions/cache/restore@v5` all completed successfully; `actions/cache/save@v5` was skipped because the Playwright Chromium cache hit.
  - Playwright/browser evidence: `Running 5 tests using 2 workers`; `5 passed (9.4s)`; harness wall time `16.76s`; reporter budget remained under `10s`.
  - Cache timing observation: Playwright Chromium cache restore completed in about `2s`; explicit save step was skipped on cache hit, avoiding the previous hidden post-job cache-save delay.


## Current CI web performance observability pass (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ci-web-performance-observability`
- Branch: `codex/ci-web-performance-observability`
- Base: `origin/main` at merge commit `1897b0a` from PR `https://github.com/yangshu2087/draftorbit/pull/3`.
- Goal: keep the required `Web required checks` lane intact while making the Playwright suite faster and observable in GitHub Actions.
- PR #3 integration status:
  - PR #3 was merged into `main` at `2026-04-17T08:56:57Z`.
  - Merge commit: `1897b0acc6df2105a5b4594874233038bbde9d6e`.
  - `main` branch protection still requires `Web required checks` with `strict: true`.
- CI changes in this pass:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ci-web-performance-observability/.github/workflows/ci.yml`
    - keeps the required command `pnpm --filter @draftorbit/web test`.
    - uses setup-node pnpm cache with `cache-dependency-path: pnpm-lock.yaml`.
    - caches Playwright Chromium under `/home/runner/.cache/ms-playwright`.
    - writes CI web test step wall time to `$GITHUB_STEP_SUMMARY`.
    - enforces `WEB_PLAYWRIGHT_REPORTER_BUDGET_SECONDS=10` for the required web test lane.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ci-web-performance-observability/apps/web/scripts/run-playwright-ci.mjs`
    - starts Next dev server explicitly in CI.
    - waits for server readiness.
    - warms `/`, `/app`, `/pricing`, `/connect?intent=connect_x_self`, and `/queue?intent=confirm_publish` before timing the Playwright suite.
    - runs `playwright test --config playwright.config.ts` with `WEB_PLAYWRIGHT_SKIP_WEBSERVER=1`.
    - parses Playwright reporter time, enforces the 10s budget when enabled, and writes warmup/reporter/wall-time rows to `$GITHUB_STEP_SUMMARY`.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ci-web-performance-observability/apps/web/playwright.config.ts`
    - supports `WEB_PLAYWRIGHT_SKIP_WEBSERVER=1` so the CI harness can own server lifecycle and warmup.
    - runs the browser suite in CI with `2` workers and `fullyParallel` enabled by default; local non-CI runs remain single-worker unless overridden.
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ci-web-performance-observability/apps/web/e2e/ordinary-user-ci.spec.ts`
    - grants clipboard permissions to the active `WEB_PLAYWRIGHT_BASE_URL` / `WEB_PLAYWRIGHT_PORT` origin, avoiding hard-coded local ports during CI-style local verification.
- GitHub Actions iteration:
  - First performance PR run proved the budget gate worked but failed with Playwright reporter time `12.4s > 10s`.
  - Follow-up fix enabled CI parallelism for this isolated ordinary-user suite while keeping deterministic local defaults. The final workflow pins `WEB_PLAYWRIGHT_WORKERS=2` and consolidates the generation matrix into one browser test to avoid runner CPU contention while keeping coverage.
  - Second performance PR run improved to `10.2s` but still failed the strict `10s` budget.
  - Follow-up fix added explicit `/connect` and `/queue` warmup because those routes were responsible for the remaining cold compile cost in the final safe-gate browser scenario.
- Local browser/performance verification:
  - Command:
    `NEXT_PUBLIC_API_URL=/__api NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true CI=true WEB_PLAYWRIGHT_PORT=3313 WEB_PLAYWRIGHT_REPORTER_BUDGET_SECONDS=10 WEB_PLAYWRIGHT_ENFORCE_BUDGET=1 GITHUB_STEP_SUMMARY=/tmp/draftorbit-web-summary.md npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test`
  - Result: `23/23` node tests passed; `8/8` Chromium Playwright tests passed.
  - Playwright reporter time: `5.5s`.
  - Harness wall time after warmup: `6.76s`.
  - After CI parallelism fix, repeated command on `WEB_PLAYWRIGHT_PORT=3314` passed with Playwright reporter time `4.0s` and harness wall time `5.54s`.
  - After route-warmup fix, repeated command on `WEB_PLAYWRIGHT_PORT=3315` passed with Playwright reporter time `3.9s` and harness wall time `5.82s`.
  - A 4-worker attempt was fast locally but slower on GitHub due runner contention, so the suite was consolidated to reduce page/context churn while keeping 2 workers.
  - After consolidating the four generation scenarios into one stepped browser test, repeated command on `WEB_PLAYWRIGHT_PORT=3317` passed with `5/5` browser tests, Playwright reporter time `3.4s`, and harness wall time `6.84s`.
  - Summary file confirmed:
    - Next/web warmup + Playwright wall time `3.94s`
    - Playwright reporter time `3.40s`
    - Reporter budget `10.00s`
    - Budget status `pass`
    - warm `/`, `/app`, `/pricing` all HTTP `200`.
    - warm `/connect?intent=connect_x_self` and `/queue?intent=confirm_publish` both HTTP `307` as expected redirect gates.
- Additional local verification:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed.


## Current PR CI web required-check wiring pass (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence`
- Branch: `codex/live-provider-evidence`
- PR: `https://github.com/yangshu2087/draftorbit/pull/3`
- User request: wire the new ordinary-user web Playwright suite into repository/PR CI, make `pnpm --filter @draftorbit/web test` a required check, then do a focused CI performance pass so the Playwright suite stays around the 10-second lane.
- New workflow: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/.github/workflows/ci.yml`
  - Runs on `pull_request` and pushes to `main` / `codex/**`.
  - Adds the PR check job `Web required checks`.
  - Installs pnpm `10.23.0`, Node `22`, project dependencies, and Chromium via `pnpm --filter @draftorbit/web exec playwright install --with-deps chromium`.
  - Required web lane steps are `pnpm --filter @draftorbit/web typecheck`, `pnpm --filter @draftorbit/web test`, and `pnpm --filter @draftorbit/web build`.
  - Uploads ignored Playwright failure artifacts from `output/playwright/web-ci` for debugging.
- Required-test status: repository code now provides the GitHub Actions check and includes `pnpm --filter @draftorbit/web test` as a non-optional workflow step. GitHub branch protection on `main` was configured through the GitHub API with required status check `Web required checks` and `strict: true`.
- Playwright performance pass in `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/web/playwright.config.ts`:
  - Chromium-only suite remains serial and deterministic with `workers: 1`.
  - Test timeout is reduced to `30s`; expect timeout is reduced to `5s`.
  - HTML report generation is removed from the normal CI path; reporter is `list`.
  - Video remains off; screenshots are failure-only; CI trace is `on-first-retry`.
  - `NEXT_TELEMETRY_DISABLED=1` is set for the dev server command.
- Performance evidence:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` passed with `23/23` node tests and `8/8` Playwright tests; Playwright reporter time was `6.3s`.
  - Timed direct Playwright run passed with `8/8` tests; Playwright reporter time was `7.8s` (`/usr/bin/time` shell real time was `10.54s`, including `npx`/pnpm startup overhead).
- Browser/visual evidence: the Playwright suite is a real Chromium browser pass over `/`, `/app`, `/queue`, `/connect`, and `/pricing`; local visual artifact remains ignored at `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/playwright/web-ci/ordinary-user-ci-ordinary--9617e-focus-and-responsive-layout-chromium/home-local-cta-mobile.png`.
- Backend/API lane evidence kept for this CI wiring pass: `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` passed `236/236`, covering V3 DTO validation, signed asset-token access, source fail-closed semantics, publish safety, provider-live skip/fail-closed policy, and visual quality gates.
- GitHub Actions evidence:
  - Initial PR/push runs appeared under workflow `CI` with job `Web required checks`.
  - The first run failed in the web node tests because the workflow intentionally sets `NEXT_PUBLIC_API_URL=/__api`, while two assertions still expected the old default `http://localhost:4000`.
  - Fix applied in `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/web/test/v3-result-preview.test.ts`: asset and ZIP URL expectations now derive from `process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'`, matching the public web API contract in CI and local runs.
  - The next run reached Chromium and exposed a mock contract mismatch: e2e fixture asset URLs already included `/__api`, while the app correctly prefixes relative API asset paths with `NEXT_PUBLIC_API_URL=/__api`, producing `/__api/__api/...`.
  - Fix applied in `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/web/e2e/ordinary-user-ci.spec.ts`: mocked backend asset and bundle URLs now use backend-style `/v3/...` paths so the client owns API-base qualification.
- Local caveat: one local CI-mode simulation that tried to launch a second Next dev server was blocked by an existing Next dev-server lock from the already-open local web page. The workflow runs on a clean GitHub runner and the non-CI Playwright pass verified the actual browser suite against the reused local server.
- Verification run in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed: `23/23` node tests and `8/8` Playwright tests, Playwright reporter time `6.3s`.
  - `NEXT_PUBLIC_API_URL=/__api NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed after the CI-only URL expectation fix: `23/23` node tests and `8/8` Playwright tests, Playwright reporter time `6.4s`.
  - `NEXT_PUBLIC_API_URL=/__api NEXT_PUBLIC_ENABLE_LOCAL_LOGIN=true npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed after the backend-style mock asset URL fix: `23/23` node tests and `8/8` Playwright tests, Playwright reporter time `7.4s`.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — passed: `236/236` tests.
  - `git diff --check` — passed.


## Current web CI Playwright suite pass (2026-04-17)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence`
- Branch: `codex/live-provider-evidence`
- User request: turn the ordinary-user UAT critical paths into a CI-runnable Playwright suite and replace the `@draftorbit/web` placeholder test.
- New web test command: `pnpm --filter @draftorbit/web test` now runs `tsx --test test/**/*.test.ts` plus `playwright test --config playwright.config.ts`; it no longer prints `web tests pending`.
- New Playwright config: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/web/playwright.config.ts`
  - starts/reuses a Next dev server on `127.0.0.1:3300`; default API base is `/__api` for CI mocks.
  - output is ignored/local-only under `output/playwright/web-ci/`.
- New CI suite: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/web/e2e/ordinary-user-ci.spec.ts`
  - mocks local auth, bootstrap/profile/queue/billing, V3 run/stream/detail, signed assets, bundle zip, retry assets, and safe connection routes.
  - covers `/` → `/app`, hover/focus-visible local CTA, mobile overflow guard, tweet cover, thread cards, article cover/infographic/illustration/export/source evidence, diagram SVG, latest-source fail-closed, Markdown copy success, visual retry success, queue/connect/pricing safe gates.
  - does not use real OpenAI/OpenRouter/Tavily keys and does not execute real X posting or payment.
- Existing web node tests were kept and made cwd-independent by using `import.meta.url` for source-file reads.
- Browser/visual evidence from the passing run: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/playwright/web-ci/ordinary-user-ci-ordinary--9617e-focus-and-responsive-layout-chromium/home-local-cta-mobile.png`
- Verification run in this pass:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed: `23/23` node tests and `8/8` Playwright tests.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
  - `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed.
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — passed: `236/236` tests.
- Product status after this pass: `Core Flow Ready` for the CI UI contract; `Mock / Stubs Remaining` is intentional inside the web CI suite because real provider/baoyu quality remains covered by the separate UAT/live-provider lanes.


## Current ordinary-user full-flow validation (2026-04-17_01-07-30)

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence`
- Branch: `codex/live-provider-evidence`
- User request: validate the ordinary `/` → `/app` path and full product workflow: tweet, thread, article, diagram, URL source, latest fail-closed, visual assets, export, queue, connect and pricing.
- Local services used: API `http://127.0.0.1:4311`, Web `http://127.0.0.1:3300`, Postgres `5433`, Redis `6379`.
- baoyu runtime pin verified with `node scripts/ensure-baoyu-skills-runtime.mjs`: `9977ff520c49ea0888d8d43d582973c6e8c1d55a`.
- Browser/UAT command passed with Codex local quality evidence enabled: `7/7` generation/source cases and `5/5` route audits.
- Tracked UAT report: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-17_01-07-30.md`
- Local-only screenshot/artifact root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/playwright/ordinary-user-baoyu-sync-2026-04-17_01-07-30/`
- Manual `/` → `/app` CTA verification screenshots:
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/playwright/full-flow-manual/home-local-cta-hover-focus.png`
  - `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/playwright/full-flow-manual/app-after-local-cta.png`
- Direct fixes applied in this validation pass: none required; UAT and manual browser checks did not expose a confirmed user-facing defect.
- Safety outcomes: latest ambiguous Hermes query failed closed with source guidance; explicit URL source generated ready `sourceArtifacts`; X publish remained prepare/manual-confirm/connect only; pricing checkout entry was visible but no real payment was executed.
- UI states covered: default route shells, hover/focus on the local home CTA, generation loading/result success, source error/fail-closed recovery copy, disabled retry state when no failed assets, copy Markdown success toast, responsive route/generation screenshots at `375`, `768`, `1024`, `1440`.
- Backend/API lane evidence: `GET /health/ready` returned DB/Redis ready; UAT exercised `POST /auth/local/session`, `POST /v3/session/bootstrap`, `POST /v3/chat/run`, `GET /v3/chat/runs/:id`, signed asset downloads, `GET /v3/chat/runs/:id/assets.zip`, and `POST /v3/chat/runs/:id/assets/retry`. Error semantics observed: latest/no-source path returned a quality/source-blocked result rather than fabricated content; signed download URLs required tokens; workspace-authenticated retry returned ready signed assets.
- Remaining caveat: this pass used Codex OAuth local evidence and no live OpenAI/OpenRouter/Tavily keys; provider-live evidence remains a separate optional lane via `pnpm provider:live`.


## Current live provider evidence pass

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence`
- Branch: `codex/live-provider-evidence`
- Base: `codex/full-flow-user-iteration` (`e8c9dda test: extend ordinary user full-flow uat actions`)
- Goal: add an optional real-provider acceptance lane for `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and `TAVILY_API_KEY` without making those keys required for default local UAT.
- New command: `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 provider:live`
- Current local env status at implementation time: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and `TAVILY_API_KEY` were missing, so the provider-live report records `skipped_missing_key` for all three providers. This is expected and does not invalidate the default Codex/Ollama/baoyu path.
- Current tracked provider-live report: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/reports/provider-live/PROVIDER-LIVE-EVIDENCE-2026-04-17_07-46-31.md`
- Local-only provider evidence root: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/artifacts/provider-live-evidence/2026-04-17_07-46-31/`
- Policy: configured provider keys must produce `live_pass` from the matching provider or `fail_closed`; mock/free/Ollama/Codex-local fallback is never counted as provider live quality evidence.

## Current goal

- Current pass: optional real-provider acceptance on top of `codex/full-flow-user-iteration`.
- User-facing target: keep the default local Codex/Ollama/baoyu flow passing without provider keys, while giving operators a separate command that proves OpenAI/OpenRouter/Tavily live evidence when keys are present.
- Direct iteration scope: add a small provider-live script, regression tests, docs, and a tracked skip/pass/fail report; do not change production provider routing or make live keys required for default UAT.

## Source artifacts

- Requested original project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Current implementation worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence`
- Current branch: `codex/live-provider-evidence`
- Previous full-flow worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration`
- Base branch/commit: `codex/codex-oauth-baoyu-visual-upgrade` at `3e805a2 feat: add codex local visual parity pipeline`
- Previous visual parity worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/codex-oauth-baoyu-visual-upgrade`
- baoyu runtime source: `vendor/baoyu-skills`, pinned by `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/scripts/ensure-baoyu-skills-runtime.mjs` to `9977ff520c49ea0888d8d43d582973c6e8c1d55a`
- Browser/UAT evidence from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/output/playwright/ordinary-user-baoyu-sync-2026-04-16_23-06-44/`
- Tracked Markdown report from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_23-06-44.md`

## Done in this pass

- Expanded `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/scripts/ordinary-user-baoyu-sync.ts` so ordinary-user UAT now verifies concrete result actions instead of only route/result presence:
  - signed SVG asset downloads require tokenized `assetUrl`/`signedAssetUrl`
  - `assets.zip` bundle download requires a signed token and ZIP magic bytes
  - Markdown/HTML export downloads are fetched when present
  - `复制 Markdown` is clicked in the browser and must show the success toast
  - visual retry UI state is recorded; tweet cover case also exercises the retry API in a workspace-authenticated request
  - `/pricing` confirms checkout entry visibility but does not click into real payment
- Added regression coverage in `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/apps/api/test/ordinary-user-baoyu-sync.test.ts` so ready visual runs cannot pass without signed assets and a signed bundle URL.
- Produced a new tracked UAT/baoyu report under `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/output/reports/uat-full/`.
- Reverted generated build-only drift in `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/apps/web/next-env.d.ts`; large Playwright screenshots and runtime artifacts remain ignored/local-only.

## Ordinary-user browser/UAT coverage

- Routes checked: `/`, `/app`, `/connect?intent=connect_x_self`, `/queue?intent=confirm_publish`, `/pricing`.
- Breakpoints checked for each route: `375`, `768`, `1024`, `1440`.
- Browser console/page errors: none reported in the final UAT report.
- Generation cases checked end-to-end through local API/Web:
  - `tweet-cold-start` with cover asset, signed SVG download, signed bundle, Markdown/HTML downloads, copy toast, retry API.
  - `thread-product-update` with 4-card series, signed downloads, copy toast, safe publish gate.
  - `article-judgement-without-examples` with cover + summary visuals + Markdown/HTML/export bundle.
  - `article-generic-scaffold-gate` with quality-gate/recoverability coverage.
  - `diagram-process-prompt` with `visualRequest.mode=diagram` and diagram SVG.
  - `latest-hermes-source` fail-closed without a reliable source/search provider.
  - `latest-hermes-agent-url-source` with captured URL source artifact and article visual/export assets.
- Safe external-action checks:
  - X publishing remains prepare/manual-confirm/connect only; no real X post was executed.
  - Pricing shows a checkout entry, but UAT does not click or execute real payment.

## Product-relevant baoyu matrix in the tracked report

- Runtime-integrated or validated: `baoyu-url-to-markdown`, `baoyu-danger-x-to-markdown`, `baoyu-imagine`, `baoyu-diagram`, `baoyu-markdown-to-html`.
- Parity-through-artifact/rubric: `baoyu-format-markdown`, `baoyu-image-cards`, `baoyu-cover-image`, `baoyu-infographic`, `baoyu-article-illustrator`.
- Deprecated/migrated: `baoyu-image-gen` → `baoyu-imagine`.
- Safe blocked external action: `baoyu-post-to-x` remains prepare/export/manual-confirm only.
- Future safe gap: `baoyu-compress-image`; not an active promised UI workflow in this pass.

## Verification

Fresh verification run from `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration`:

- `node scripts/ensure-baoyu-skills-runtime.mjs` — passed; runtime checked out `9977ff520c49ea0888d8d43d582973c6e8c1d55a` and required skills were present.
- Targeted regression:
  - `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx --test test/ordinary-user-baoyu-sync.test.ts` — passed, `17/17` tests.
- Browser/UAT pass:
  ```bash
  CODEX_LOCAL_ADAPTER_ENABLED=1 \
  MODEL_ROUTER_ENABLE_CODEX_LOCAL=1 \
  CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1 \
  MODEL_ROUTING_PROFILE=local_quality \
  BAOYU_SKILLS_DIR=vendor/baoyu-skills \
  BAOYU_RUNTIME_ARTIFACTS_DIR=artifacts/baoyu-runtime \
  API_URL=http://127.0.0.1:4311 \
  WEB_URL=http://127.0.0.1:3300 \
  PLAYWRIGHT_HEADLESS=1 \
  npm_config_cache=/tmp/draftorbit-npm-cache \
  npx pnpm@10.23.0 --filter @draftorbit/api exec tsx ../../scripts/ordinary-user-baoyu-sync.ts
  ```
  Passed, `7/7` cases, tracked report at `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_23-06-44.md`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed on Next.js `16.2.2` during local server preparation.
- Full final API/Web verification should be rerun immediately before commit if more code changes are made after this handoff update.

## Local environment caveats

- This pass used local services: API `4311`, Web `3300`, Postgres `5433`, Redis `6379`.
- No real `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or Tavily key was required for the default pass.
- Optional provider live evidence is now isolated in `scripts/provider-live-evidence.ts`; missing keys are `skipped_missing_key`, configured-but-failing keys are `fail_closed`, and reports go to `output/reports/provider-live/`.
- Codex local evidence was explicitly enabled with `CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1`; missing live search remains intentionally fail-closed unless the user supplies a URL.
- Large screenshots, provider outputs, and runtime artifacts remain ignored/local-only under `output/playwright/` and `artifacts/`.
- `vendor/baoyu-skills` is local-only; use `node scripts/ensure-baoyu-skills-runtime.mjs` to refresh it reproducibly.

## Next step

- Run final full verification commands, then stage and commit the UAT script, regression test, handoff update, and tracked UAT report.

## Blockers

- None known after the current UAT pass.

## Changed files of interest

- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/scripts/provider-live-evidence.ts`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/apps/api/test/provider-live-evidence.test.ts`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/live-provider-evidence/output/reports/provider-live/PROVIDER-LIVE-EVIDENCE-2026-04-17_07-46-31.md`

- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/scripts/ordinary-user-baoyu-sync.ts`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/apps/api/test/ordinary-user-baoyu-sync.test.ts`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/docs/agent-handoff.md`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/full-flow-user-iteration/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_23-06-44.md`
