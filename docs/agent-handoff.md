# Agent Handoff

Use this file to transfer execution state between Codex, Cursor, and other agents.
Update it before pausing work, switching tools, or asking another agent to continue.


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
