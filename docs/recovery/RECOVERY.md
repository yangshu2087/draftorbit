# DraftOrbit Recovery

## Current paths

- Requested target project root: `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io`
- Implementation worktree for this branch: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/recover-draftorbit-final`
- Recovery branch: `codex/recover-draftorbit-final`

## Recovery provenance

See `RECOVERY-SOURCE.md` at the project root.

Current branch was recovered from a clean `origin/codex/design-md-rollout` git base plus the user-confirmed final local Codex worktree/current recovered overlay. Backup snapshots under `/Volumes/AI_BACKUP_8T/ai-dev-2t-snapshots/` are retained as evidence, not as the overlay source, because they include stale V1 workbench route files.

## Restore procedure

1. Clone or fetch `https://github.com/yangshu2087/draftorbit.git`.
2. Create a worktree or branch from `origin/codex/design-md-rollout`.
3. Overlay the confirmed final source tree from `/Volumes/AI_DEV_2T/01-projects/active/openclaw-workspace/projects/002-draftorbit.io` or `/Users/yangshu/.codex/worktrees/draftorbit-visual-card-pipeline`.
4. Exclude `.env*` except `.env.example`, `node_modules`, `.next`, `.turbo`, `dist`, `build`, `.vercel`, logs, and TypeScript build-info files.
5. Preserve large runtime evidence locally under `artifacts/` and `output/playwright/`; do not commit it unless explicitly approved.
6. Run the recovery verification commands from the task plan before treating the restored tree as usable.

## Notes

Historical recovery docs may still cite `/Volumes/AI_SSD/...` or `/Users/yangshu/.openclaw/...` paths. Those paths are kept as historical evidence unless the file is an active index or entrypoint.
