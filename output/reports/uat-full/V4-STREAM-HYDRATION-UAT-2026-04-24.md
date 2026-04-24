# V4 Stream Hydration UAT — 2026-04-24

## Scope

Validate that `/v4` in logged-in/self-host mode starts from a local preview, listens to the real V3 run stream, then replaces the preview with the completed real run that exposes signed asset and bundle downloads.

## Environment

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Branch: `codex/draftorbit-v4-creator-studio`
- Web: `http://127.0.0.1:3400/v4`
- API: `http://127.0.0.1:4311`
- Model routing: `codex-local` first, `MODEL_ROUTER_ENABLE_OLLAMA=0`
- Browser tool: `browser-use` in-app browser (`iab` backend)

## Product / UX contract checked

- User can enter a prompt on `/v4` and click `生成 V4 图文包`.
- While real generation is running, the UI can keep an interim/local preview but does not present it as a downloadable signed bundle.
- When the real run emits package/publish-prep done through stream hydration, the UI replaces local preview with real run result.
- Real result shows provenance (`codex-local · codex-local/quick`), signed asset links, enabled `下载 bundle`, and safe publish copy (`不会自动真实发帖`).
- Prompt wrapper/provider stderr/auth token details are not exposed to the user.

## Browser-use evidence

| Step | Result | Evidence |
| --- | --- | --- |
| Open `/v4` | Pass | `V4 Creator Studio · DraftOrbit` loaded in in-app browser |
| Generate tweet cover in logged-in/self-host mode | Pass | Prompt: `别再靠灵感写推文，给我一条关于 AI 产品冷启动的判断，并配一张封面。` |
| Stream hydration | Pass | Stream completed after ~55s; run id `d16c437b-2805-4f6d-a641-5e1f03beb8ec` |
| Preview replacement | Pass | Notice: `真实 run 已完成：d16c437b-2805-4f6d-a641-5e1f03beb8ec。已替换为真实 signed asset / bundle 结果。` |
| Signed asset UI | Pass | Visible `下载 SVG`, `下载 MARKDOWN`, `下载 HTML` asset actions |
| Bundle UI | Pass | `下载 bundle` enabled only after real run completion |
| Prompt/error leak check | Pass | Browser check: `hasPromptLeak=false`, `hasRawErrorLeak=false` |
| Visual screenshot | Pass | `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/v4-stream-hydration-2026-04-24.png` |

## Backend / API evidence

- `GET /health` returned `200 OK` with `live=true`, `ready=true`, `dependencies.db=true`, `dependencies.redis=true`.
- Protected run detail remains auth-scoped: unauthenticated/shell-created mismatched local session for this browser-owned run returned `401/404`, confirming ownership checks are not bypassed.
- Signed download routes validated with short-lived asset tokens for the completed run:
  - `HEAD /v3/chat/runs/d16c437b-2805-4f6d-a641-5e1f03beb8ec/assets/01-cover?...` => `200 OK`, `Content-Type: image/svg+xml`, `Content-Length: 1614`.
  - `HEAD /v3/chat/runs/d16c437b-2805-4f6d-a641-5e1f03beb8ec/assets.zip?...` => `200 OK`, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="d16c437b-2805-4f6d-a641-5e1f03beb8ec-visual-assets.zip"`, `Content-Length: 6610`.
- Data consistency: DB run status is `DONE`, first asset provider is `codex-local-svg`; large SVG/zip artifacts remain under ignored artifact roots.

## Regression coverage added

- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/apps/web/test/v4-studio.test.ts`
  - stream hydration gates on package/publish-prep done events.
  - hydration polling returns real preview once text or ready signed assets exist.
  - local preview bundle remains disabled until a real signed bundle URL exists.
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/apps/api/test/v4-studio-contract.test.ts`
  - V4 normalized intent no longer leaks `V4 Creator Studio`, routing, provider, or Codex OAuth wrapper text.
  - V4 preview maps `visualAssetsBundleUrl` into the public contract.
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/apps/api/test/content-strategy.test.ts`
  - anti-pattern gate catches V4 Creator Studio wrapper leakage.
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/apps/web/e2e/ordinary-user-ci.spec.ts`
  - CI V4 local-preview path now asserts bundle is disabled until real signed run completion.

## Verification commands

- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web exec tsx --test test/v4-studio.test.ts` ✅ `9/9`
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx --test test/v4-studio-contract.test.ts test/content-strategy.test.ts` ✅ `111/111`
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` ✅
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` ✅
- `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` ✅
- `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` ✅ `32 node tests + 5 Playwright tests`, harness `7.52s`

## Remaining risks

- Browser-use stream UAT depends on local Codex OAuth runtime latency. Timeout was raised to 180s because an earlier run completed after ~155s; the successful rerun completed in ~55s.
- Shell-created local sessions can differ from the browser session; API ownership enforcement is preserved, but API detail checks should use the active browser session or signed URLs rather than assuming a new local session owns the run.
