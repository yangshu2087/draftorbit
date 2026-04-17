# Agent Handoff

Use this file to transfer execution state between Codex, Cursor, and other agents.
Update it before pausing work, switching tools, or asking another agent to continue.

## Current goal

- Upgrade DraftOrbit on `codex/codex-oauth-baoyu-visual-upgrade` so the ordinary tweet/thread/article flow has product-relevant baoyu-skills visual parity: cover, thread cards, infographic/article illustration, diagram, Markdown/HTML export bundle, and safe X publish preparation.
- Use Codex OAuth only as a local adapter through `codex exec --output-last-message`; do not read/copy/commit `~/.codex/auth.json` and do not treat ChatGPT-managed auth as a production API key.
- Keep default visual evidence keyless and auditable through locally rendered SVG/HTML/Markdown artifacts; OpenAI/OpenRouter/raster providers are optional future provider seams.

## Source artifacts

- Requested project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Current implementation worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/codex-oauth-baoyu-visual-upgrade`
- Current branch: `codex/codex-oauth-baoyu-visual-upgrade`
- Base branch: `codex/ordinary-user-baoyu-audit` (`ecdc6dc test: audit ordinary user baoyu parity`)
- Recovery baseline branch: `codex/recover-draftorbit-final` (`7735787 restore: recover draftorbit final state`)
- Confirmed source-of-truth recovery worktree: `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline`
- baoyu runtime source: `vendor/baoyu-skills`, pinned by `scripts/ensure-baoyu-skills-runtime.mjs` to `9977ff520c49ea0888d8d43d582973c6e8c1d55a`
- Browser/UAT evidence from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/codex-oauth-baoyu-visual-upgrade/output/playwright/ordinary-user-baoyu-sync-2026-04-16_21-19-00/`
- Tracked Markdown report from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/codex-oauth-baoyu-visual-upgrade/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_21-19-00.md`

## Done in this pass

- Added `CodexLocalService` and wired it into `ModelGatewayService` and `CoreModule`.
  - Local adapter calls `codex exec --ephemeral --sandbox read-only --profile <profile> --output-last-message <tmp> --color never <prompt>`.
  - It parses the last-message file rather than stdout and fail-closes on disabled, busy, timeout, missing CLI/output, and malformed provider states.
  - `local_quality` routes text generation as `codex-local` first, then OpenAI/OpenRouter candidates, then Ollama/free fallbacks.
- Extended persisted provider metadata with Prisma enum values `CODEX_LOCAL` and `OLLAMA`, plus `Generation.visualRequest`.
- Added V3 `visualRequest` validation for `mode`, `style`, `layout`, `palette`, `aspect`, and `exportHtml`.
- Upgraded the visual pipeline to generate and gate local SVG/HTML/Markdown assets with provenance metadata:
  - tweet → cover
  - thread → card series
  - article → cover + infographic/illustration + optional Markdown/HTML export
  - diagram intent or `visualRequest.mode=diagram` → standalone diagram SVG
  - export bundle → signed bundle URL
- Added prompt/spec/SVG/HTML/Markdown artifact output under ignored `artifacts/baoyu-runtime/<runId>/visual/`.
- Added quality gates for prompt leakage, placeholder/mock images, unsupported renderers, malformed assets, missing thread visuals, and SVG/export handling.
- Kept `baoyu-imagine` as the active visual provider seam and documented `baoyu-image-gen` as deprecated/migrated.
- Added workspace/signed-token checks for run assets and bundle download endpoints; asset URLs are signed per run/asset and expire.
- Upgraded `/app` ordinary-user UX with advanced visual controls, provenance labels, SVG/Markdown/HTML/bundle actions, and retry-only visual asset support.
- Maintained safe X behavior: prepare/manual-confirm/connect only; no real X posting, no payment execution, no reverse-engineered login.
- Updated `scripts/ensure-baoyu-skills-runtime.mjs` and `scripts/ordinary-user-baoyu-sync.ts` for the new baoyu pin, product visual matrix, full route/breakpoint audit, diagram case, Codex-local quality evidence handling, and tracked Markdown report output.

## Ordinary-user browser/UAT coverage

- Routes checked: `/`, `/app`, `/connect?intent=connect_x_self`, `/queue?intent=confirm_publish`, `/pricing`.
- Breakpoints checked for each route: `375`, `768`, `1024`, `1440`.
- Generation cases checked end-to-end through local API/Web:
  - `tweet-cold-start` with cover asset.
  - `thread-product-update` with 4-card series.
  - `article-judgement-without-examples` with cover + visual summary + exports.
  - `article-generic-scaffold-gate` with quality-gate/recoverability coverage.
  - `diagram-process-prompt` with `visualRequest.mode=diagram` and diagram SVG.
  - `latest-hermes-source` fail-closed without a reliable source/search provider.
  - `latest-hermes-agent-url-source` with captured URL source artifact and article visual/export assets.
- Console/page errors in final UAT: none reported.
- The UAT report records `primaryModel: codex-local/quick` for quality-evidence cases because `CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1` was explicitly enabled.

## Product-relevant baoyu matrix in the tracked report

- Runtime-integrated or validated: `baoyu-url-to-markdown`, `baoyu-danger-x-to-markdown`, `baoyu-imagine`, `baoyu-diagram`, `baoyu-markdown-to-html`.
- Parity-through-artifact/rubric: `baoyu-format-markdown`, `baoyu-image-cards`, `baoyu-cover-image`, `baoyu-infographic`, `baoyu-article-illustrator`.
- Deprecated/migrated: `baoyu-image-gen` → `baoyu-imagine`.
- Safe blocked external action: `baoyu-post-to-x` remains prepare/export/manual-confirm only.
- Future safe gap: `baoyu-compress-image`; not an active promised UI workflow in this pass.

## Verification

Fresh verification run from `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/codex-oauth-baoyu-visual-upgrade`:

- `node scripts/ensure-baoyu-skills-runtime.mjs` — passed; runtime checked out `9977ff520c49ea0888d8d43d582973c6e8c1d55a` and required skills were present.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — passed, `233/233` API tests.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed; package currently prints `web tests pending`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed on Next.js `16.2.2`.
- Full ordinary-user UAT/browser pass:
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
  Passed, `7/7` cases, with tracked report at `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_21-19-00.md`.

## Local environment caveats

- No real `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or Tavily key was required for the default pass.
- Missing live search provider is intentionally represented by fail-closed latest-fact behavior unless the user provides a URL.
- Large screenshots, provider outputs, and runtime artifacts remain ignored/local-only under `output/playwright/` and `artifacts/`.
- `vendor/baoyu-skills` is local-only; `scripts/ensure-baoyu-skills-runtime.mjs` is the reproducible way to refresh it.

## Next step

- Review the final diff, then stage/commit if the user wants a permanent local checkpoint or PR.

## Blockers

- None known after the final verification pass.

## Changed files of interest

- `apps/api/src/common/codex-local.service.ts`
- `apps/api/src/common/model-gateway.service.ts`
- `apps/api/src/core.module.ts`
- `apps/api/src/modules/generate/visual-request.ts`
- `apps/api/src/modules/generate/baoyu-runtime.service.ts`
- `apps/api/src/modules/generate/visual-planning.service.ts`
- `apps/api/src/modules/generate/visual-card-render.service.ts`
- `apps/api/src/modules/generate/content-quality-gate.ts`
- `apps/api/src/modules/generate/generate.service.ts`
- `apps/api/src/modules/v3/v3.controller.ts`
- `apps/api/src/modules/v3/v3.dto.ts`
- `apps/api/src/modules/v3/v3.service.ts`
- `apps/web/components/v3/operator-app.tsx`
- `apps/web/lib/queries.ts`
- `apps/web/lib/v3-result-preview.ts`
- `packages/db/prisma/schema.prisma`
- `scripts/ensure-baoyu-skills-runtime.mjs`
- `scripts/ordinary-user-baoyu-sync.ts`
- `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-16_21-19-00.md`
