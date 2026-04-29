# DraftOrbit Panoramic Content Automation UAT — 2026-04-29

## Scope

- Worktree: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio`
- Branch: `codex/panoramic-content-automation-refactor`
- Goal: validate the first-stage “智能内容与自动化中枢” refactor driven by the uploaded panoramic structure diagram.
- Safety boundary: no real X posting, no real payment, no final OAuth grant. Queue/connect/pricing remain safe entry points or manual-confirm flows.

## Architecture mapping evidence

See `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/docs/architecture/panoramic-content-automation-map.md`.

The 12-layer reference diagram is mapped into 8 DraftOrbit product domains:

1. 用户层
2. 接入层
3. 数据采集层
4. 数据治理层
5. 智能中枢
6. 内容生成层
7. 工作流与执行层
8. 监控商业生态层

First-stage implementation uses `operationSummary` as the unified run summary instead of adding a separate enterprise dashboard.

## API / backend smoke

Local API was started on `127.0.0.1:4311` with local self-host mode and CORS `APP_URL=http://127.0.0.1:3400`.

| Check | Result | Evidence |
| --- | --- | --- |
| `/health` | PASS | HTTP `200`, `ready=true`, `db=true`, `redis=true` |
| Unauthenticated protected route `/v3/projects` | PASS | HTTP `401`, code `UNAUTHORIZED` |
| Authenticated protected route `/v3/projects` | PASS | HTTP `200`, returned `24` projects in local test workspace |
| V3 run result contract | PASS | `operationSummary` covered by API tests and returned through `GET /v3/chat/runs/:id` |
| V4 preview compatibility | PASS | V4 preview contract preserves `operationSummary` while keeping safe publish prep |

Contract boundaries preserved:

- No new public API route added.
- Existing V3/V4 route shapes remain intact.
- Existing workspace permissions and signed asset download rules are unchanged.
- Provider/model/prompt/debug details are not exposed in `operationSummary` user-facing UI.

## Browser Use UAT

Browser backend: Browser Use plugin (`iab`) against `http://127.0.0.1:3400`.

| Scenario | Result | Notes / screenshot |
| --- | --- | --- |
| `/` → local quick experience → `/app` | PASS | Home had `本机快速体验`; after logout/refresh local session worked and `/app` loaded without token error. |
| `/app` normal tweet generation | PASS | Generated a short tweet about DraftOrbit intelligent content hub; result completed and anchor `结果已生成，查看下方结果` appeared. Screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/panoramic-app-operation-hub-visible-2026-04-29.png` |
| `/app` operation hub summary | PASS | Result section showed `智能中枢概览`, `数据源`, `治理`, `智能中枢`, `工作流`, `图文资产`; no raw provider/prompt/debug leakage detected. |
| `/projects` project hub summary | PASS | Project page showed `全景中枢概览`, project context, manual-confirm boundary, and safe queue/connect/pricing entries. Screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/panoramic-projects-operation-hub-2026-04-29.png` |
| URL-source flow with `https://example.com/` | PASS | Source-ready run showed `来源已采用`, deliverable result, `智能中枢概览`, and ready assets; no `基于该来源重写一版` fallback was needed. Screenshot: `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/panoramic-url-source-operation-hub-visible-2026-04-29.png` |
| Safety boundary | PASS | UI continued to show manual confirmation / connect entry; no real X post, payment, or final OAuth grant executed. |

Additional raw screenshot paths from the same session:

- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/panoramic-app-operation-hub-2026-04-29.png`
- `/Users/yangshu/.config/superpowers/worktrees/002-draftorbit.io/draftorbit-v4-creator-studio/output/playwright/manual-check/panoramic-url-source-operation-hub-2026-04-29.png`

## Automated verification

| Command | Result |
| --- | --- |
| `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api test` | PASS `275/275` |
| `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api typecheck` | PASS |
| `npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web typecheck` | PASS |
| `WEB_PLAYWRIGHT_SKIP_WEBSERVER=1 WEB_PLAYWRIGHT_BASE_URL=http://127.0.0.1:3400 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web test` | PASS Node `48/48`, Playwright `6/6`, harness `7.63s` |
| `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311 npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/web build` | PASS `15/15` pages |

## Risks / follow-up

- The first-stage hub is intentionally lightweight. Full enterprise BI, CRM, IAM, multi-channel execution and automated scheduling remain future phases.
- Browser Use verified `/app`, `/projects`, URL-source, and safe boundaries. It did not execute real X OAuth final approval, real posting, or real billing.
- Future work can add historical trend cards powered by `UsageLog` / `AuditLog`, but should keep provider/prompt details out of ordinary user UI.
