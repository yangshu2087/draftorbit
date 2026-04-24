# V4 Browser-use UAT — 2026-04-23

## Scope

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Branch: `codex/draftorbit-v4-creator-studio`
- Route under test: `http://127.0.0.1:3400/v4`
- Browser tool: `browser-use` with in-app browser (`iab`) backend.
- Runtime stance: Codex OAuth local adapter first; Ollama remains opt-in/low-memory fallback only.

## User journey checked

| Step | Result | Evidence |
| --- | --- | --- |
| Open `/v4` | Pass | V4 heading visible: `Codex OAuth 优先的图文创作工作台` |
| Select `Diagram` format | Pass | Format card selected; routing chip visible: `Codex OAuth first · Ollama off` |
| Enter ordinary user prompt | Pass | Prompt: `用流程图解释：输入→来源→正文→图文→手动确认发布。` |
| Generate preview | Pass | Preview shows `Codex 本机 SVG`, `baoyu-diagram`, and safe manual publish copy |
| Export actions | Pass | `复制 Markdown` and `下载 bundle` controls visible/enabled after preview |
| Safe publish gate | Pass | UI copy stays `准备发布 / 手动确认`; no real X post action executed |
| baoyu parity panel | Pass | `baoyu-imagine`, cover/cards/infographic, article illustrator, diagram, markdown-to-html, safe post-to-x visible |

## Screenshot / artifact evidence

- Browser-use screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-browser-use-creator-studio-2026-04-23.png`
- Playwright CI failure-recovery evidence remains under ignored `output/playwright/web-ci/` and final run passed.

## Backend/API lane evidence

- Public capabilities contract: `GET /v4/studio/capabilities`.
- Protected generation contract: `POST /v4/studio/run` under `AuthGuard` + subscription generation check.
- Protected preview contract: `GET /v4/studio/runs/:id` under `AuthGuard` and mapped from workspace-scoped V3 run retrieval.
- Error semantics: freshness/latest prompt without URL returns `424 SOURCE_REQUIRED` with `recoveryAction=add_source` and no raw prompt/provider stderr.
- Permissions: V4 reuses V3 workspace-scoped `getRun` and signed asset URLs; V3 rollback routes are preserved.
- Data consistency: V4 stores/serves metadata through existing V3 generation run path; large visual artifacts remain under ignored artifact roots.

## Notes

- This pass implements the first TDD slice: V4 route/API/preview contract plus Creator Studio shell.
- Browser-use verification used the local UI preview path when no browser token/API run was available; Playwright CI mocks cover protected `/v4/studio/run` and `/v4/studio/runs/:id` response mapping.

## Iteration addendum — local preview download gate (2026-04-24)

- Tool: `browser-use` in-app browser against `http://127.0.0.1:3400/v4`.
- Finding: local no-token preview showed ready Codex SVG metadata but also enabled `下载 bundle`; this was misleading because local UI preview assets do not yet have signed download URLs.
- Fix: `buildV4StudioPreview()` now computes `hasDownloadableAssets` from real normalized signed URLs and exposes `bundleActionCopy`.
- UX result: local preview shows disabled `登录后生成下载链接`; authenticated/mock run previews with signed URLs still show enabled `下载 bundle`.
- Browser evidence after fix: thread preview generated, `Codex 本机 SVG` visible, `准备发布 / 手动确认` visible, and disabled `登录后生成下载链接` visible.
- Regression: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/apps/web/test/v4-studio.test.ts` includes `V4 preview only enables bundle download when a real signed asset URL exists`.
