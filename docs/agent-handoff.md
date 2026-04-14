# Agent Handoff

Use this file to transfer execution state between Codex, Cursor, and other agents.
Update it before pausing work, switching tools, or asking another agent to continue.

## Current goal

- Audit DraftOrbit from an ordinary-user perspective on `codex/ordinary-user-baoyu-audit`, starting from the recovered `codex/recover-draftorbit-final` baseline.
- Compare the product-relevant baoyu-skills subset against upstream `JimLiu/baoyu-skills` main commit `dcd0f81433490d85f72a0eae557a710ab34bc9b1`.
- Keep real external posting/payment/dangerous login actions blocked; record missing model/search keys as fail-closed evidence, not quality-pass evidence.

## Source artifacts

- Requested project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Recovery worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final`
- Confirmed source-of-truth worktree: `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline`
- Current recovered tree source: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Backup evidence only: `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-20260413-212706/01-projects/active/openclaw-workspace/projects/021-draftorbit.io` and `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-post-verify-20260413-213205/01-projects/active/openclaw-workspace/projects/021-draftorbit.io`
- Audit implementation worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit`
- Browser evidence from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/ordinary-user-baoyu-audit/output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/`
- Tracked Markdown report from this pass: `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-14_00-28-39.md`

## Branch

- Current branch: `codex/ordinary-user-baoyu-audit`
- Base: `codex/recover-draftorbit-final` (`7735787 restore: recover draftorbit final state`)
- Last refreshed: `2026-04-14 15:30:20 CST`

## Done

- Created isolated recovery worktree from `origin/codex/design-md-rollout`.
- Overlaid the confirmed final tree while excluding `.git`, `.env*` except `.env.example`, `node_modules`, `.next`, `.turbo`, `dist`, `.vercel`, logs, and TypeScript build-info artifacts.
- Restored active API/Web/V3/baoyu/source/visual pipeline code and small Markdown reports/docs.
- Added recovery/source documentation in `RECOVERY-SOURCE.md`, `docs/INDEX.md`, and `docs/recovery/RECOVERY.md`.
- Preserved historical recovery docs under `docs/recovery/` with current-path banners and fixed active internal recovery links.
- Updated `scripts/handoff-refresh.sh` to compute the repo root dynamically.
- Added `.gitignore` rules to protect large local recovery evidence under `artifacts/`, `output/playwright/`, and `data/`, while keeping README/index files trackable.
- Fixed the three known API test regressions from the recovery pass:
  - `apps/api/test/baoyu-runtime.test.ts` now resolves the repo root from the test file and expects `vendor/baoyu-skills` at repo root.
  - `apps/api/test/content-benchmark.test.ts` now expects the final adversarial suite size `11`.
  - `apps/api/test/model-gateway.test.ts` now reads `apps/api/src/core.module.ts` from repo root instead of `process.cwd()`.
- Updated the baoyu runtime pin and ensure script to upstream main `dcd0f81433490d85f72a0eae557a710ab34bc9b1`.
- Added the ordinary-user baoyu audit matrix for the product-relevant baoyu subset and report-copy output under `output/reports/uat-full/`.
- Added route/browser audit coverage for `/`, `/app`, `/connect?intent=connect_x_self`, `/queue?intent=confirm_publish`, and `/pricing` at 375/768/1024/1440.
- Fixed a `/pricing` hydration mismatch by deferring localStorage token-derived user state until client mount.

## Verification

- `git status --short` — ran before staging; dirty only with intended code/doc/report changes and ignored local evidence.
- `node scripts/ensure-baoyu-skills-runtime.mjs` — passed; vendor runtime checked out `dcd0f81433490d85f72a0eae557a710ab34bc9b1` under ignored `vendor/baoyu-skills/`.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx --test test/baoyu-runtime.test.ts test/ordinary-user-baoyu-sync.test.ts` — passed, 21/21 targeted tests.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — passed, 224/224 tests.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed; package currently prints `web tests pending`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed.
- Production browser pass: with API at `http://127.0.0.1:4311` and Next production server at `http://127.0.0.1:3300`, ran `ORDINARY_USER_CASE_IDS=latest-hermes-source PLAYWRIGHT_HEADLESS=1 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx ../../scripts/ordinary-user-baoyu-sync.ts` — passed.
  - Routes checked: `/`, `/app`, `/connect?intent=connect_x_self`, `/queue?intent=confirm_publish`, `/pricing`.
  - Breakpoints checked for each route: 375, 768, 1024, 1440.
  - Source/latest failure path checked: `latest-hermes-source` correctly failed closed with recoverable “需要可靠来源” copy because no live search provider was configured.
  - Console/page errors: none in the final production pass.
  - Evidence: ignored screenshots/artifacts under `output/playwright/ordinary-user-baoyu-sync-2026-04-14_00-28-39/`; tracked report at `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-14_00-28-39.md`.
- Local environment caveat: no `OPENAI_API_KEY`/`OPENROUTER_API_KEY` or Tavily key was present, so live model-based tweet/thread/article quality beyond fail-closed latest-source behavior was not counted as baoyu quality-pass evidence.

## Next step

- Commit locally and keep `codex/ordinary-user-baoyu-audit` unpushed unless the user requests a PR.

## Blockers

- None.

## Changed files

- `apps/api/src/modules/generate/baoyu-runtime.service.ts`
- `apps/api/src/modules/generate/benchmarks/baoyu-skills-map.ts`
- `apps/api/test/baoyu-runtime.test.ts`
- `apps/api/test/ordinary-user-baoyu-sync.test.ts`
- `apps/web/app/pricing/page.tsx`
- `docs/agent-handoff.md`
- `scripts/ensure-baoyu-skills-runtime.mjs`
- `scripts/ordinary-user-baoyu-sync.ts`
- `output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-14_00-28-39.md`
