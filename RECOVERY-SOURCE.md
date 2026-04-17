# DraftOrbit Recovery Source

## Current paths

- Requested target project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Implementation worktree for this recovery branch: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final`
- Recovery branch: `codex/recover-draftorbit-final`

## Source priority

1. **GitHub remote baseline**: `https://github.com/yangshu2087/draftorbit.git`
   - Clean base used for this branch: `origin/codex/design-md-rollout` at `98daec8899367e5b31fd9920287d4b5d25640f64`.
2. **Confirmed final local Codex worktree**: `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline`
   - User-confirmed content baseline for the final restored state.
   - Contains the V3/baoyu source + visual pipeline state from 2026-04-12.
3. **Recovered working tree at target root**: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
   - Used as the overlay source because it already combined the confirmed Codex worktree with post-recovery path/doc organization.
4. **Backup snapshots used as evidence only**:
   - `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-20260413-212706/01-projects/active/openclaw-workspace/projects/021-draftorbit.io`
   - `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/ai-dev-2t-post-verify-20260413-213205/01-projects/active/openclaw-workspace/projects/021-draftorbit.io`

## Recovery mode

- A clean git worktree was created from `origin/codex/design-md-rollout`.
- The confirmed final local tree was overlaid with `rsync --delete` to remove stale GitHub-baseline files that are not part of the selected final state.
- Backup snapshots were not overlaid because they still contain stale V1 workbench route files such as old `dashboard`, `audit`, `topics`, `settings`, and related workspace components.
- `origin/codex/v3-abc-pr` was not merged because it contains adjacent article-publish work that was not part of the confirmed final baseline.

## Overlay exclusions

The recovery overlay intentionally excluded:

- `.git`, `.git/`
- `.env`, `.env.*` except `.env.example`
- `node_modules/`
- `.next/`
- `.turbo/`
- `dist/`, `build/`
- `.vercel/`
- `*.log`
- `apps/web/tsconfig.tsbuildinfo`

## Data policy

- `artifacts/` and `output/playwright/` are preserved locally as runtime evidence but are ignored from git by default.
- Small Markdown reports under `output/reports/` and README/index files are eligible for git tracking.
- Secrets and local environment files are never restored or committed.

## Rationale

The old AI_SSD location is no longer the canonical working location for this recovery. The latest reachable and user-confirmed source of truth is the Codex worktree/current recovered tree, with backup snapshots retained only as audit evidence.
