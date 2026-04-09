# DraftOrbit Article Publish Follow-up Verification (2026-04-08)

## Summary
- Scope: article publish Phase 1 follow-up after capability/UI split.
- Target branch: `codex/v3-abc-pr`.
- Verification type: code checks + real browser verification.
- Result: pass.

## What this follow-up verified
1. `manual_x_web` remains the truthful default article publish mode.
2. `/app` article task panel renders the saved-state UX after an article URL has been recorded.
3. The new capability split does not introduce console or page runtime errors.
4. API / shared / web verification suites still pass after the provider seam and UI split.

## Verification commands
```bash
npx pnpm@10.23.0 --filter @draftorbit/shared build
npx pnpm@10.23.0 --filter @draftorbit/db prisma:generate
npx pnpm@10.23.0 --filter @draftorbit/api test
npx pnpm@10.23.0 --filter @draftorbit/api typecheck
npx pnpm@10.23.0 --filter @draftorbit/api build
/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/node_modules/.pnpm/node_modules/.bin/tsx --test \
  /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/article-publish-ui.test.ts \
  /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-ui.test.ts \
  /Users/yangshu/.codex/worktrees/draftorbit-article-publisher/apps/web/test/v3-result-copy.test.ts
npx pnpm@10.23.0 --filter @draftorbit/web typecheck
npx pnpm@10.23.0 --filter @draftorbit/web build
```

## Browser verification
### Environment
- Web: `http://127.0.0.1:3200`
- API: `http://127.0.0.1:4100`
- Auth path: local dev session via `POST /auth/local/session`
- Verified run: `20185df0-4b7a-4d58-aa01-6dc6d69e3715`

### Route checked
`/app?nextAction=export_article&highlight=20185df0-4b7a-4d58-aa01-6dc6d69e3715&published=20185df0-4b7a-4d58-aa01-6dc6d69e3715`

### Expected UX
- task panel title shows article export flow
- saved state confirms the article URL has already been recorded
- panel tells the user they can close and continue generating
- console errors = 0
- page errors = 0

### Actual result
- saved-state text detected: `true`
- continue-state text detected: `true`
- console errors: `0`
- page errors: `0`

## Fresh artifacts
- Screenshot:
  - `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved-fresh.png`
- Machine-readable probe:
  - `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved-fresh.json`

## Note on environment correction
During the first fresh probe, the task panel showed `网络连接失败，请检查服务是否启动` because the API dev server had been restarted with `APP_URL=http://127.0.0.1:3100` while the web dev server was running at `http://127.0.0.1:3200`. After restarting API with `APP_URL=http://127.0.0.1:3200`, the saved-state article panel rendered correctly.

## Related committed evidence
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-ARTICLE-REPORT-uat-article-2026-04-08_23-38-21-483.md`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/reports/uat-full/UAT-EVIDENCE-INDEX-uat-article-2026-04-08_23-38-21-483.md`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-flow.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-result-saved.png`
- `/Users/yangshu/.codex/worktrees/draftorbit-article-publisher/output/playwright/article-export-2026-04-08/article-task-panel-saved.png`
