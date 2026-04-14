# Agent Handoff

Use this file to transfer execution state between Codex, Cursor, and other agents.
Update it before pausing work, switching tools, or asking another agent to continue.

## Current goal

- Recover DraftOrbit to the user-confirmed final Codex worktree baseline on `codex/recover-draftorbit-final` and leave the result auditable, verified, and ready to commit.
- Keep stale V1 workbench pages and adjacent `origin/codex/v3-abc-pr` article-publish work out of this recovery pass.

## Source artifacts

- Requested project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Implementation worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final`
- Confirmed source-of-truth worktree: `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline`
- Current recovered tree source: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Backup evidence only: `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-20260413-212706/01-projects/active/openclaw-workspace/projects/021-draftorbit.io` and `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-post-verify-20260413-213205/01-projects/active/openclaw-workspace/projects/021-draftorbit.io`
- Browser evidence from this pass: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final/output/playwright/recovery-ui-2026-04-14/`

## Branch

- Current branch: `codex/recover-draftorbit-final`
- Base: `origin/codex/design-md-rollout` (`98daec8`)
- Recovery source policy: overlay the confirmed Codex/current final tree; do not reintroduce backup-only stale V1 routes.
- Local evidence policy: keep `artifacts/` and `output/playwright/` locally and ignored; commit only README/index/report Markdown unless explicitly approved otherwise.

## Done

- Created isolated recovery worktree from `origin/codex/design-md-rollout`.
- Overlaid the confirmed final tree while excluding `.git`, `.env*` except `.env.example`, `node_modules`, `.next`, `.turbo`, `dist`, `.vercel`, logs, and TypeScript build-info artifacts.
- Restored active API/Web/V3/baoyu/source/visual pipeline code and small Markdown reports/docs.
- Added recovery/source documentation in `RECOVERY-SOURCE.md`, `docs/INDEX.md`, and `docs/recovery/RECOVERY.md`.
- Preserved historical recovery docs under `docs/recovery/` with current-path banners and fixed active internal recovery links.
- Updated `scripts/handoff-refresh.sh` to compute the repo root dynamically.
- Added `.gitignore` rules to protect large local recovery evidence under `artifacts/`, `output/playwright/`, and `data/`, while keeping README/index files trackable.
- Fixed the three known API test regressions:
  - `apps/api/test/baoyu-runtime.test.ts` now resolves the repo root from the test file and expects `vendor/baoyu-skills` at repo root.
  - `apps/api/test/content-benchmark.test.ts` now expects the final adversarial suite size `11`.
  - `apps/api/test/model-gateway.test.ts` now reads `apps/api/src/core.module.ts` from repo root instead of `process.cwd()`.

## Verification

- Targeted RED run first confirmed the expected 3 failures in `baoyu-runtime`, `content-benchmark`, and `model-gateway`; targeted rerun then passed: 22/22 tests.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/db prisma:generate` — passed; required because install skipped Prisma postinstall scripts.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` — passed, 219/219 tests.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` — passed.
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` — passed; package currently prints `web tests pending`.
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` — passed; Next.js generated `/`, `/app`, `/connect`, `/queue`, billing/auth routes.
- UI checklist/browser gate: `UI_REVIEW_URL=http://127.0.0.1:3100 UI_REVIEW_ARTIFACT_DIR=output/playwright/recovery-ui-2026-04-14 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web ui:review` — passed.
  - Browser route checked: `/` at `http://127.0.0.1:3100/`.
  - Title checked: `DraftOrbit — 一句话生成可发的 X 内容`.
  - Breakpoints/screenshots checked: 375, 768, 1024, 1440.
  - Console/page errors: `errors.txt` was empty.
  - Visual note: landing route screenshots showed no obvious clipping or horizontal overflow in the checked breakpoints; deeper authenticated states were not exercised in this browser pass.

## Next step

- Final git audit, stage only intended recovery code/docs/report Markdown, commit the recovery branch, and optionally push/open PR when requested.

## Blockers

- None.
